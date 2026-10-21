import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, decisions, docPages, tasks } from "@/db";
import { POST } from "@/app/api/mcp/route";
import { createMcpServer } from "@/server/mcp/server";
import { makeOrg, makeProject, resetDb } from "../db";

let client: Client;

beforeEach(async () => {
  await resetDb();
  const server = createMcpServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(b);
});
afterEach(() => client.close());

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { type: string; text: string }[])[0].text;
  if (res.isError) return { error: text };
  return JSON.parse(text);
}

describe("MCP tools", () => {
  it("lists the tools with read-only hints on reads", async () => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual([
      "add_change_request",
      "add_open_question",
      "create_task",
      "get_client",
      "get_doc_page",
      "get_project",
      "get_thread",
      "import_messages",
      "list_pipeline",
      "list_projects",
      "log_decision",
      "recent_messages",
      "save_business_rule",
      "save_doc_page",
      "search",
      "update_project_brief",
    ]);
    expect(byName.search.annotations?.readOnlyHint).toBe(true);
    expect(byName.log_decision.annotations?.readOnlyHint).toBe(false);
  });

  it("imports messages from a screenshot transcript and finds them again", async () => {
    const org = await makeOrg({ name: "Bakery" });
    const project = await makeProject({ orgId: org.id, name: "Shop" });
    const res = await call("import_messages", {
      clientId: org.id,
      projectId: project.id,
      channel: "whatsapp",
      me: "Tomasz",
      messages: [
        { sender: "Anna", sentAt: "2026-10-05 14:32", body: "Can we add a blog?" },
        { sender: "Tomasz", sentAt: "2026-10-05T14:40:00+02:00", body: "Sure, +6h" },
      ],
    });
    expect(res).toMatchObject({ saved: 2 });

    const found = await call("search", { query: "blog" });
    expect(found.messages.map((m: { body: string }) => m.body)).toEqual(["Can we add a blog?"]);

    const recent = await call("recent_messages", { since: "2026-10-01" });
    expect(recent.threads[0].messages.map((m: { from: string; at: string }) => [m.from, m.at])).toEqual([
      ["Anna", "2026-10-05 14:32"],
      ["me", "2026-10-05 14:40"],
    ]);
  });

  it("gives project context and records decisions, change requests, briefs, docs and tasks", async () => {
    const project = await makeProject({ name: "Shop", pricing: "fixed", fixedPrice: 10_000_00 });
    expect(await call("update_project_brief", { projectId: project.id, briefMd: "Shopify store for a bakery" })).toEqual({ ok: true });
    expect(await call("log_decision", { projectId: project.id, title: "Use Shopify", decidedBy: "Anna" })).toEqual({ ok: true });
    expect(
      await call("add_change_request", { projectId: project.id, title: "Blog", hoursImpact: "+6h", priceImpact: 1500 }),
    ).toEqual({ ok: true });
    const page = await call("save_doc_page", {
      projectId: project.id,
      title: "Flow",
      bodyMd: "```mermaid\nflowchart LR\n A --> B\n```",
    });
    const updated = await call("save_doc_page", { projectId: project.id, pageId: page.pageId, title: "Flow", bodyMd: "v2" });
    expect(updated.pageId).toBe(page.pageId);
    expect(await call("create_task", { projectId: project.id, title: "Set up theme", priority: 2 })).toMatchObject({
      taskId: expect.any(Number),
    });

    const ctx = await call("get_project", { projectId: project.id });
    expect(ctx).toMatchObject({
      name: "Shop",
      brief: "Shopify store for a bakery",
      fixedPrice: 10_000_00,
      priceWithApprovedChanges: 10_000_00, // the change is only proposed
      changeRequests: [{ title: "Blog", status: "proposed", hoursImpactMin: 360, priceImpact: 1500_00 }],
      decisions: [{ title: "Use Shopify", decidedBy: "Anna" }],
      openTasks: [{ title: "Set up theme", priority: 2 }],
      docPages: [{ id: page.pageId, title: "Flow" }],
    });
    expect((await db.select().from(docPages))[0].bodyMd).toBe("v2");
    expect(await db.select().from(decisions)).toHaveLength(1);
    expect(await db.select().from(tasks)).toHaveLength(1);
  });

  it("records open questions and business rules, and updates a rule without losing fields", async () => {
    const project = await makeProject();
    expect(await call("add_open_question", { projectId: project.id, question: "Keep recordings how long?", owner: "Anna" })).toEqual({
      ok: true,
    });
    expect(
      await call("save_business_rule", { projectId: project.id, rule: "Never quote prices", implementedIn: "main prompt" }),
    ).toEqual({ ok: true });
    let ctx = await call("get_project", { projectId: project.id });
    expect(ctx.openQuestions).toMatchObject([{ code: "Q-01", question: "Keep recordings how long?", owner: "Anna" }]);
    expect(ctx.businessRules).toMatchObject([{ code: "BR-01", rule: "Never quote prices", implementedIn: "main prompt" }]);

    const ruleId = ctx.businessRules[0].id;
    expect(await call("save_business_rule", { projectId: project.id, ruleId, rule: "Never quote prices or margins" })).toEqual({
      ok: true,
    });
    ctx = await call("get_project", { projectId: project.id });
    expect(ctx.businessRules).toMatchObject([{ code: "BR-01", rule: "Never quote prices or margins", implementedIn: "main prompt" }]);

    const other = await makeProject({ name: "Other" });
    expect(await call("save_business_rule", { projectId: other.id, ruleId, rule: "x" })).toEqual({
      error: `Rule ${ruleId} isn't in project ${other.id}`,
    });
  });

  it("returns errors as tool errors", async () => {
    expect(await call("get_project", { projectId: 999 })).toEqual({ error: "No project 999" });
    const project = await makeProject();
    expect(await call("update_project_brief", { projectId: project.id, briefMd: "password: hunter22hunter" })).toEqual({
      error: "That looks like a password or key. Keep credentials in a password manager, not in SoloOS.",
    });
    const other = await makeProject({ name: "Other" });
    const page = await call("save_doc_page", { projectId: project.id, title: "A", bodyMd: "a" });
    expect(await call("save_doc_page", { projectId: other.id, pageId: page.pageId, title: "A", bodyMd: "b" })).toEqual({
      error: `Doc page ${page.pageId} isn't in project ${other.id}`,
    });
  });
});

describe("/api/mcp route", () => {
  const rpc = (body: object, auth?: string) =>
    new Request("https://soloos.example/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(auth ? { authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

  afterEach(() => vi.unstubAllEnvs());

  it("asks for OAuth when there's no token", async () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    const res = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://soloos.example/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("answers JSON-RPC with a valid token", async () => {
    vi.stubEnv("APP_PASSWORD", "hunter2");
    vi.stubEnv("MCP_TOKEN", "t".repeat(32));
    const init = await POST(
      rpc(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
        },
        `Bearer ${"t".repeat(32)}`,
      ),
    );
    expect(init.status).toBe(200);
    const body = await init.json();
    expect(body.result.serverInfo.name).toBe("soloos");
    expect(body.result.instructions).toContain("SoloOS");

    const list = await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, `Bearer ${"t".repeat(32)}`));
    expect((await list.json()).result.tools.length).toBe(16);
  });
});
