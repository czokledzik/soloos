import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { contacts, db, interactions, messages, opportunities, threadParticipants, threads } from "@/db";
import { convertOpportunityToProject, createLead } from "@/server/crm-actions";
import { listClients, listPipeline } from "@/server/crm-queries";
import {
  deleteMessage,
  importTelegram,
  savePastedThread,
  updateParticipant,
  type PastedThread,
} from "@/server/message-actions";
import { getThread, listAllThreads, listThreads } from "@/server/message-queries";
import { form, makeOrg, ok, resetDb } from "../db";

beforeEach(resetDb);

const pasted = (orgId: number, extra: Partial<PastedThread> = {}): PastedThread => ({
  orgId,
  channel: "facebook",
  title: "Messenger",
  me: "Me",
  messages: [
    { sender: "Anna Nowak", at: "2026-10-05T14:32", body: "Ile kosztuje sklep?" },
    { sender: "Me", at: "2026-10-05T14:40", body: "Zależy od zakresu" },
    { sender: "Anna Nowak", at: "2026-10-05T15:00", body: "Ok" },
  ],
  ...extra,
});

describe("paste and fix", () => {
  it("saves a thread with participants mapped to contacts and me", async () => {
    const org = await makeOrg();
    const [anna] = await db.insert(contacts).values({ orgId: org.id, name: "anna nowak" }).returning();
    const id = ok(await savePastedThread(pasted(org.id)));

    const t = (await getThread(id))!;
    expect(t.lastMessageAt).toEqual(new Date(2026, 9, 5, 15, 0));
    expect(t.participants.map((p) => [p.name, p.contactId, p.isMe])).toEqual([
      ["Anna Nowak", anna.id, false],
      ["Me", null, true],
    ]);
    expect(t.messages.map((m) => [m.sender, m.isMe, m.bodyMd])).toEqual([
      ["anna nowak", false, "Ile kosztuje sklep?"],
      ["Me", true, "Zależy od zakresu"],
      ["anna nowak", false, "Ok"],
    ]);
  });

  it("validates input", async () => {
    const org = await makeOrg();
    expect(await savePastedThread(pasted(org.id, { messages: [] }))).toEqual({ ok: false, error: "Add at least one message" });
    expect(
      await savePastedThread(pasted(org.id, { messages: [{ sender: "A", at: "yesterday", body: "x" }] })),
    ).toEqual({ ok: false, error: "Every message needs a date and time" });
    expect(
      await savePastedThread(pasted(org.id, { messages: [{ sender: "A", at: "2026-10-05T10:00", body: "  " }] })),
    ).toEqual({ ok: false, error: "Add at least one message" });
  });

  it("converting a pasted interaction replaces it with the thread", async () => {
    const org = await makeOrg();
    const [i] = await db
      .insert(interactions)
      .values({ orgId: org.id, bodyMd: "Anna: hi\nMe: hello", occurredAt: new Date() })
      .returning();
    ok(await savePastedThread(pasted(org.id, { interactionId: i.id })));
    expect(await db.select().from(interactions)).toEqual([]);
    expect(await db.select().from(threads)).toHaveLength(1);
  });

  it("appending to a thread reuses its participants", async () => {
    const org = await makeOrg();
    const id = ok(await savePastedThread(pasted(org.id)));
    ok(
      await savePastedThread(
        pasted(org.id, { threadId: id, messages: [{ sender: "anna nowak", at: "2026-10-06T09:00", body: "Jeszcze jedno" }] }),
      ),
    );
    expect(await db.select().from(threadParticipants)).toHaveLength(2);
    expect((await getThread(id))!.messages).toHaveLength(4);
  });

  it("appending to a missing thread fails, and appends always use the thread's client", async () => {
    const org = await makeOrg();
    const other = await makeOrg({ name: "Other" });
    expect(await savePastedThread(pasted(org.id, { threadId: 9999 }))).toEqual({ ok: false, error: "Thread not found" });
    const id = ok(await savePastedThread(pasted(org.id)));
    ok(await savePastedThread(pasted(other.id, { threadId: id })));
    expect((await getThread(id))!.orgId).toBe(org.id);
  });

  it("an outgoing message moves a new lead to contacted", async () => {
    const leadId = ok(await createLead(form({ companyName: "Bakery", title: "Shop" })));
    const lead = (await db.query.opportunities.findFirst({ where: eq(opportunities.id, leadId) }))!;
    ok(await savePastedThread(pasted(lead.orgId, { opportunityId: leadId, me: null })));
    expect((await listPipeline())[0].stage).toBe("new");

    const [me] = await db.select().from(threadParticipants).where(eq(threadParticipants.name, "Me"));
    ok(await updateParticipant(me.id, { isMe: true }));
    const [row] = await listPipeline();
    expect(row.stage).toBe("contacted");
    expect(row.lastContactAt).toEqual(new Date(2026, 9, 5, 15, 0));
  });

  it("lead threads move to the project on conversion", async () => {
    const leadId = ok(await createLead(form({ companyName: "Bakery", title: "Shop" })));
    const lead = (await db.query.opportunities.findFirst({ where: eq(opportunities.id, leadId) }))!;
    ok(await savePastedThread(pasted(lead.orgId, { opportunityId: leadId })));
    const projectId = ok(await convertOpportunityToProject(leadId));
    expect((await listThreads({ projectId })).map((t) => t.messages.length)).toEqual([3]);
  });

  it("deleting the last message removes the empty thread", async () => {
    const org = await makeOrg();
    const id = ok(
      await savePastedThread(pasted(org.id, { messages: [{ sender: "A", at: "2026-10-05T10:00", body: "only" }] })),
    );
    const [m] = await db.select().from(messages).where(eq(messages.threadId, id));
    ok(await deleteMessage(m.id));
    expect(await db.select().from(threads)).toEqual([]);
  });

  it("client last contact includes messages", async () => {
    const org = await makeOrg();
    ok(await savePastedThread(pasted(org.id)));
    expect((await listClients())[0].lastContactAt).toEqual(new Date(2026, 9, 5, 15, 0));
  });

  it("search finds threads by message text", async () => {
    const org = await makeOrg({ name: "Bakery" });
    ok(await savePastedThread(pasted(org.id)));
    expect((await listAllThreads("zakresu")).map((t) => [t.orgName, t.count, t.people])).toEqual([["Bakery", 3, "Anna Nowak"]]);
    expect(await listAllThreads("nothing like this")).toEqual([]);
    expect(await listAllThreads("100%")).toEqual([]);
  });
});

describe("Telegram import", () => {
  const file = () => new File([readFileSync("test/fixtures/telegram-full.json")], "result.json");
  const upload = (extra: Record<string, string>) => {
    const fd = new FormData();
    fd.set("file", file());
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };

  it("previews chats with a suggested client", async () => {
    const org = await makeOrg({ name: "Bakery" });
    await db.insert(contacts).values({ orgId: org.id, name: "Jan Kowalski" });
    const res = ok(await importTelegram(upload({ dryRun: "1" })));
    expect(res.meId).toBe("user1001");
    expect(res.chats.map((c) => [c.name, c.messages, c.suggestedOrgId, c.alreadyImported])).toEqual([
      ["Shop project", 3, org.id, 0],
      ["Anna Nowak", 4, null, 0],
    ]);
    expect(await db.select().from(threads)).toEqual([]);
  });

  it("imports assigned chats once, adding only new messages on re-import", async () => {
    const org = await makeOrg({ name: "Bakery" });
    const res = ok(await importTelegram(upload({ assign: JSON.stringify({ 3003: org.id }) })));
    expect(res.imported).toEqual({ threads: 1, messages: 3, duplicates: 0 });

    const [t] = await listThreads({ orgId: org.id });
    expect(t).toMatchObject({ channel: "telegram", title: "Shop project", source: "telegram" });
    expect(t.messages.map((m) => [m.sender, m.isMe])).toEqual([
      ["Jan Kowalski", false],
      ["Me", true],
      ["Anna Nowak", false],
    ]);

    const again = ok(await importTelegram(upload({ assign: JSON.stringify({ 3003: org.id, 2002: org.id }) })));
    expect(again.imported).toEqual({ threads: 1, messages: 4, duplicates: 3 });
    expect(await db.select().from(threads)).toHaveLength(2);
  });

  it("skips chats assigned to 0", async () => {
    const org = await makeOrg();
    const res = ok(await importTelegram(upload({ assign: JSON.stringify({ 3003: 0, 2002: org.id }) })));
    expect(res.imported).toEqual({ threads: 1, messages: 4, duplicates: 0 });
  });

  it("needs at least one assigned chat", async () => {
    expect(await importTelegram(upload({ assign: "{}" }))).toEqual({ ok: false, error: "Pick a client for at least one chat" });
  });
});
