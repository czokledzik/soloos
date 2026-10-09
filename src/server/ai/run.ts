import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { aiJobs, db, type AiJob } from "@/db";
import { buildPrompt, schemas, SYSTEM, type AiKind } from "./tasks";

export type AiProvider = "api" | "runner" | "off";

/** AI_PROVIDER picks; without it, the API is used when ANTHROPIC_API_KEY is set. */
export function aiProvider(): AiProvider {
  const p = process.env.AI_PROVIDER;
  if (p === "api" || p === "runner" || p === "off") return p;
  return process.env.ANTHROPIC_API_KEY ? "api" : "off";
}

export const AI_MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";

/** Jobs a runner claimed but never finished become claimable again after this. */
const STALE_MS = 10 * 60_000;

export const subjectKey = (kind: AiKind, id: number) => `${kind}:${id}`;

/** Creates a job; runs it right away with the API provider, otherwise leaves it for the runner. */
export async function requestJob(
  kind: AiKind,
  subjectId: number,
  provider = aiProvider(),
  call: (kind: AiKind, prompt: string) => Promise<unknown> = callApi,
): Promise<AiJob> {
  if (provider === "off") throw new AiError("AI is off. Set ANTHROPIC_API_KEY, or AI_PROVIDER=runner with a local runner.");
  const prompt = await buildPrompt(kind, subjectId);
  const [job] = await db
    .insert(aiJobs)
    .values({ kind, subject: subjectKey(kind, subjectId), provider, prompt, status: provider === "api" ? "running" : "queued", startedAt: provider === "api" ? new Date() : null })
    .returning();
  if (provider === "runner") return job;
  try {
    const result = await call(kind, prompt);
    return finish(job.id, { result });
  } catch (e) {
    return finish(job.id, { error: e instanceof Error ? e.message : String(e) });
  }
}

export class AiError extends Error {}

/** One structured-output request. Refusals fall back server-side to another model ("default" routing). */
export async function callApi(kind: AiKind, prompt: string, client = new Anthropic()) {
  try {
    const response = await client.beta.messages.parse({
      model: AI_MODEL(),
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "medium", format: betaZodOutputFormat(schemas[kind]) },
    });
    if (response.stop_reason === "refusal") throw new AiError("Claude declined this request.");
    if (response.stop_reason === "max_tokens") throw new AiError("The answer was too long and got cut off. Try again.");
    if (!response.parsed_output) throw new AiError("Claude's answer couldn't be read. Try again.");
    return response.parsed_output;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AiError("The Anthropic API key is invalid.");
    if (e instanceof Anthropic.RateLimitError) throw new AiError("Rate limited by the Anthropic API. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic API error ${e.status ?? ""}: ${e.message}`);
    throw e;
  }
}

export async function finish(id: number, outcome: { result: unknown } | { error: string }) {
  const [job] = await db
    .update(aiJobs)
    .set({
      status: "error" in outcome ? "failed" : "done",
      result: "result" in outcome ? outcome.result : null,
      error: "error" in outcome ? outcome.error : null,
      finishedAt: new Date(),
    })
    .where(eq(aiJobs.id, id))
    .returning();
  return job;
}

export async function latestJob(kind: AiKind, subjectId: number) {
  return (
    (await db.query.aiJobs.findFirst({
      where: eq(aiJobs.subject, subjectKey(kind, subjectId)),
      orderBy: [desc(aiJobs.createdAt), desc(aiJobs.id)],
    })) ?? null
  );
}

// ---------- Runner ----------

/** Atomically hands the oldest queued (or stale running) job to a runner. */
export async function claimJob() {
  const staleBefore = new Date(Date.now() - STALE_MS);
  const rows = await db.execute<{ id: number }>(sql`
    update ${aiJobs} set status = 'running', started_at = now()
    where id = (
      select id from ${aiJobs}
      where ${aiJobs.provider} = 'runner'
        and (${aiJobs.status} = 'queued' or (${aiJobs.status} = 'running' and ${aiJobs.startedAt} < ${staleBefore.toISOString()}::timestamptz))
      order by created_at
      limit 1
      for update skip locked
    )
    returning id`);
  const id = rows[0]?.id;
  if (!id) return null;
  const job = (await db.query.aiJobs.findFirst({ where: eq(aiJobs.id, id) }))!;
  return {
    id: job.id,
    kind: job.kind,
    system: SYSTEM,
    prompt: job.prompt,
    schema: z.toJSONSchema(schemas[job.kind]),
  };
}

/** Stores a runner's answer after checking it against the job's schema. */
export async function completeJob(id: number, body: { result?: unknown; error?: string }) {
  const job = await db.query.aiJobs.findFirst({
    where: and(eq(aiJobs.id, id), inArray(aiJobs.status, ["running", "queued"])),
  });
  if (!job) throw new AiError("No such running job");
  if (body.error) return finish(id, { error: body.error.slice(0, 2000) });
  const parsed = schemas[job.kind].safeParse(body.result);
  if (!parsed.success) return finish(id, { error: `The runner's answer didn't match the expected format: ${parsed.error.issues[0]?.message}` });
  return finish(id, { result: parsed.data });
}

/** The latest job for a page, in the shape the client panel takes (null if none or AI is off). */
export async function jobView(kind: AiKind, subjectId: number) {
  if (aiProvider() === "off") return null;
  const job = await latestJob(kind, subjectId);
  return job
    ? { id: job.id, status: job.status, provider: job.provider, error: job.error, result: job.result, createdAt: job.createdAt.toISOString() }
    : null;
}
