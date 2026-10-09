import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, aiJobs } from "@/db";
import { POST as claim } from "@/app/api/ai/runner/claim/route";
import { POST as complete } from "@/app/api/ai/runner/complete/route";
import { AI_MODEL, AiError, callApi, latestJob, requestJob } from "@/server/ai/run";
import { buildPrompt } from "@/server/ai/tasks";
import { savePastedThread } from "@/server/message-actions";
import { claudeArgs, parseClaudeOutput } from "../../scripts/ai-runner-lib";
import { makeOrg, makeProject, ok, resetDb } from "../db";

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

const insights = {
  summary: "Anna wants a blog.",
  decisions: [{ title: "Use Shopify", details: "", decidedBy: "Anna", decidedOn: "2026-10-05", sourceMessageId: 1 }],
  changeRequests: [],
  tasks: [{ title: "Send quote", dueDate: null }],
  openQuestions: [],
  replyDraft: "Sure!",
};

async function thread() {
  const org = await makeOrg({ name: "Bakery" });
  const project = await makeProject({ orgId: org.id, name: "Shop", scopeMd: "- 5 pages" });
  const threadId = ok(
    await savePastedThread({
      orgId: org.id,
      projectId: project.id,
      channel: "whatsapp",
      me: "Tomasz",
      messages: [
        { sender: "Anna", at: "2026-10-05T14:32", body: "Let's go with Shopify. Can we add a blog?" },
        { sender: "Tomasz", at: "2026-10-05T14:40", body: "Sure" },
      ],
    }),
  );
  return { org, project, threadId: threadId! };
}

/** A stand-in for the SDK client that records the request and returns a canned message. */
function fakeClient(message: Partial<{ stop_reason: string; parsed_output: unknown }> | Error) {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    client: {
      beta: {
        messages: {
          parse: async (params: Record<string, unknown>) => {
            calls.push(params);
            if (message instanceof Error) throw message;
            return { stop_reason: "end_turn", parsed_output: null, ...message };
          },
        },
      },
    } as unknown as Anthropic,
  };
}

describe("prompts", () => {
  it("include the thread with message ids, the project scope and what's already logged", async () => {
    const { threadId } = await thread();
    const prompt = await buildPrompt("thread_insights", threadId);
    expect(prompt).toMatch(/\[\d+\] 2026-10-05 14:32 Anna: Let's go with Shopify/);
    expect(prompt).toContain("2026-10-05 14:40 Me: Sure");
    expect(prompt).toContain("- 5 pages");
  });
});

describe("API provider", () => {
  it("sends a structured-output request with server-side fallbacks", async () => {
    const { calls, client } = fakeClient({ parsed_output: insights });
    expect(await callApi("thread_insights", "prompt", client)).toEqual(insights);
    expect(calls[0]).toMatchObject({
      model: AI_MODEL(),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: expect.any(Object) },
      messages: [{ role: "user", content: "prompt" }],
    });
    expect(AI_MODEL()).toBe("claude-opus-5-5");
  });

  it("turns refusals, truncation and API errors into readable messages", async () => {
    await expect(callApi("lead_reply", "p", fakeClient({ stop_reason: "refusal" }).client)).rejects.toThrow("declined");
    await expect(callApi("lead_reply", "p", fakeClient({ stop_reason: "max_tokens" }).client)).rejects.toThrow("cut off");
    const authError = new Anthropic.AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers());
    await expect(callApi("lead_reply", "p", fakeClient(authError).client)).rejects.toThrow("API key is invalid");
  });

  it("stores the result (or the error) on the job", async () => {
    const { threadId } = await thread();
    const done = await requestJob("thread_insights", threadId, "api", async () => insights);
    expect(done).toMatchObject({ status: "done", result: insights, provider: "api" });
    const failed = await requestJob("thread_insights", threadId, "api", async () => {
      throw new AiError("Claude declined this request.");
    });
    expect(failed).toMatchObject({ status: "failed", error: "Claude declined this request." });
    expect((await latestJob("thread_insights", threadId))!.id).toBe(failed.id);
  });

  it("is off without a key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_PROVIDER", "");
    const { threadId } = await thread();
    await expect(requestJob("thread_insights", threadId)).rejects.toThrow(/AI is off/);
  });
});

describe("runner provider", () => {
  const req = (path: string, body?: object, token = "r".repeat(32)) =>
    new Request(`https://x/api/ai/runner/${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeEach(() => vi.stubEnv("AI_RUNNER_TOKEN", "r".repeat(32)));

  it("queues, hands out once, validates and stores the answer", async () => {
    const { threadId } = await thread();
    const job = await requestJob("thread_insights", threadId, "runner");
    expect(job.status).toBe("queued");

    expect((await claim(req("claim", undefined, "wrong".repeat(6)))).status).toBe(401);
    const claimed = await (await claim(req("claim"))).json();
    expect(claimed).toMatchObject({ id: job.id, kind: "thread_insights", schema: { type: "object" } });
    expect(claimed.prompt).toContain("Shopify");
    // Nothing else queued.
    expect((await claim(req("claim"))).status).toBe(204);

    const bad = await (await complete(req("complete", { id: job.id, result: { summary: 1 } }))).json();
    expect(bad.status).toBe("failed");
    expect(bad.error).toMatch(/didn't match the expected format/);

    const job2 = await requestJob("thread_insights", threadId, "runner");
    await claim(req("claim"));
    expect(await (await complete(req("complete", { id: job2.id, result: insights }))).json()).toEqual({ status: "done", error: null });
    expect((await latestJob("thread_insights", threadId))!.result).toEqual(insights);
  });

  it("re-hands a job whose runner went away", async () => {
    const { threadId } = await thread();
    const job = await requestJob("thread_insights", threadId, "runner");
    await claim(req("claim"));
    await db.update(aiJobs).set({ startedAt: new Date(Date.now() - 11 * 60_000) });
    expect((await (await claim(req("claim"))).json()).id).toBe(job.id);
  });
});

describe("runner CLI glue", () => {
  const job = { id: 1, kind: "lead_reply", system: "sys", prompt: "p", schema: { type: "object" } };

  it("runs claude with no tools and no MCP servers", () => {
    const args = claudeArgs(job, "claude-opus-5-5");
    expect(args).toEqual(expect.arrayContaining(["-p", "--tools", "", "--strict-mcp-config", "--no-session-persistence"]));
    expect(args[args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
    expect(args.slice(-2)).toEqual(["--model", "claude-opus-5-5"]);
  });

  it("reads structured output, or JSON inside the text result", () => {
    expect(parseClaudeOutput(JSON.stringify({ structured_output: { a: 1 }, result: "" }))).toEqual({ a: 1 });
    expect(parseClaudeOutput(JSON.stringify({ result: 'Here:\n```json\n{"a":2}\n```' }))).toEqual({ a: 2 });
    expect(parseClaudeOutput(JSON.stringify({ result: 'ok {"a":3} done' }))).toEqual({ a: 3 });
    expect(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: "Not logged in" }))).toThrow("Not logged in");
  });
});
