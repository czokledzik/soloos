import { beforeEach, describe, expect, it } from "vitest";
import { db, interactions } from "@/db";
import { savePastedThread } from "@/server/message-actions";
import { searchAll, snippet } from "@/server/search-queries";
import { makeOrg, makeProject, makeTask, ok, resetDb } from "../db";

beforeEach(resetDb);

describe("search", () => {
  it("finds things across the app, case-insensitively, with LIKE characters taken literally", async () => {
    const org = await makeOrg({ name: "Kwiaciarnia" });
    const p = await makeProject({ orgId: org.id, name: "Sklep", briefMd: "Integracja z Przelewy24" });
    await makeTask({ projectId: p.id, title: "Podpiąć PRZELEWY24 sandbox" });
    ok(await savePastedThread({ orgId: org.id, channel: "facebook", messages: [{ sender: "Anna", at: "2026-10-05T10:00", body: "Czy przelewy24 działa z BLIK?" }] }));
    await db.insert(interactions).values({ orgId: org.id, title: "Call", bodyMd: "Omówiliśmy przelewy24 i 100% zaliczki" });

    const r = await searchAll("przelewy24");
    expect([r.projects.length, r.tasks.length, r.messages.length, r.conversations.length]).toEqual([1, 1, 1, 1]);
    expect(r.messages[0]).toMatchObject({ clientName: "Kwiaciarnia" });
    expect((await searchAll("100%")).conversations).toHaveLength(1);
    expect((await searchAll("10_%")).conversations).toHaveLength(0);
  });

  it("makes snippets around the match", () => {
    const text = `${"a ".repeat(100)}NEEDLE${" b".repeat(100)}`;
    const s = snippet(text, "needle", 10);
    expect(s).toMatch(/^….{10}NEEDLE.{10}…$/);
    expect(snippet("short", "zzz")).toBe("short");
  });
});
