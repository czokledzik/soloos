import { beforeEach, describe, expect, it } from "vitest";
import { db, decisions, docPages, payments, timeEntries } from "@/db";
import { createDocPage, saveDocPage } from "@/server/doc-actions";
import {
  disablePortal,
  enablePortal,
  saveProjectUpdate,
  setDocPagePublished,
  setPortalSection,
  setUpdatePublished,
} from "@/server/portal-actions";
import { getPortal } from "@/server/portal-queries";
import { makeOrg, makeProject, makeTask, ok, resetDb } from "../db";

beforeEach(resetDb);

describe("client portal", () => {
  it("shows only published updates and docs; optional sections stay off", async () => {
    const org = await makeOrg({ name: "Clinic" });
    const p = await makeProject({ orgId: org.id, name: "Booking", notesMd: "internal: client is slow to pay" });
    await makeTask({ projectId: p.id, status: "done" });
    await makeTask({ projectId: p.id, status: "review" });
    await makeTask({ projectId: p.id, status: "todo" });
    const now = new Date();
    await db.insert(timeEntries).values({ projectId: p.id, startedAt: now, endedAt: now, durationMin: 600, rateSnapshot: 200_00 });

    const token = ok(await enablePortal(p.id))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const draft = ok(await saveProjectUpdate(null, { projectId: p.id, title: "Draft", bodyMd: "not yet" }));
    const pub = ok(await saveProjectUpdate(null, { projectId: p.id, title: "Week 1", bodyMd: "Form done" }));
    ok(await setUpdatePublished(pub, true));
    const shown = ok(await createDocPage(p.id, "Flow"));
    ok(await saveDocPage(shown, { title: "Flow", bodyMd: "```mermaid\nflowchart LR\nA-->B\n```" }));
    ok(await setDocPagePublished(shown, true));
    ok(await createDocPage(p.id, "Internal notes"));

    const portal = (await getPortal(token))!;
    expect(portal).toMatchObject({
      name: "Booking",
      clientName: "Clinic",
      progress: null,
      hours: null,
      decisions: null,
      updates: [{ title: "Week 1", bodyMd: "Form done" }],
      docs: [{ title: "Flow" }],
    });
    // Nothing internal leaks into what the page receives.
    const json = JSON.stringify(portal);
    for (const secret of ["slow to pay", "Draft", "Internal notes", "20000", "600"]) expect(json).not.toContain(secret);
    expect(draft).toBeTypeOf("number");

    ok(await setPortalSection(p.id, "progress", true));
    expect((await getPortal(token))!.progress).toEqual({ total: 3, done: 1, inProgress: 1 });
  });

  it("hides published updates without text", async () => {
    const p = await makeProject();
    const token = ok(await enablePortal(p.id))!;
    for (const [title, bodyMd] of [["Update 20 Oct", "  \n"], ["Week 2", "Testy zakończone"]]) {
      ok(await setUpdatePublished(ok(await saveProjectUpdate(null, { projectId: p.id, title, bodyMd }))!, true));
    }
    expect((await getPortal(token))!.updates.map((u) => u.title)).toEqual(["Week 2"]);
  });

  it("hours report: billable entries, value at the logged rates, payments and what's due", async () => {
    const p = await makeProject({ budgetHours: 40 });
    const token = ok(await enablePortal(p.id))!;
    const at = (iso: string) => new Date(iso);
    await db.insert(timeEntries).values([
      { projectId: p.id, startedAt: at("2026-06-24T10:00:00Z"), endedAt: at("2026-06-24T11:30:00Z"), durationMin: 90, rateSnapshot: 100_00, note: "Baza wiedzy" },
      { projectId: p.id, startedAt: at("2026-07-12T09:00:00Z"), endedAt: at("2026-07-12T09:45:00Z"), durationMin: 45, rateSnapshot: 100_00, note: "Webhook" },
      { projectId: p.id, startedAt: at("2026-07-13T09:00:00Z"), endedAt: at("2026-07-13T10:00:00Z"), durationMin: 60, rateSnapshot: 100_00, note: "prywatne", billable: false },
    ]);
    await db.insert(payments).values([
      { projectId: p.id, label: "Zaliczka", amount: 140_00, paidAt: "2026-07-01" },
      { projectId: p.id, label: "Reszta", amount: 85_00, dueDate: "2026-11-01" },
    ]);
    expect((await getPortal(token))!.hours).toBeNull();

    ok(await setPortalSection(p.id, "hours", true));
    const hours = (await getPortal(token))!.hours!;
    expect(hours).toMatchObject({ totalMin: 135, budgetHours: 40, rate: 100_00, value: 225_00, paid: 140_00, due: 85_00 });
    expect(hours.entries.map((e) => e.note)).toEqual(["Baza wiedzy", "Webhook"]);
    expect(hours.payments.map((pm) => pm.label)).toEqual(["Zaliczka", "Reszta"]);
    // Rates are only in the totals, never per entry.
    expect(JSON.stringify(hours.entries)).not.toContain("10000");
    expect(JSON.stringify(hours)).not.toContain("prywatne");
  });

  it("hours report on a fixed-price project has hours but no value", async () => {
    const p = await makeProject({ pricing: "fixed", fixedPrice: 5000_00, hourlyRate: null });
    const token = ok(await enablePortal(p.id))!;
    const now = new Date();
    await db.insert(timeEntries).values({ projectId: p.id, startedAt: now, endedAt: now, durationMin: 30, rateSnapshot: null });
    ok(await setPortalSection(p.id, "hours", true));
    expect((await getPortal(token))!.hours).toMatchObject({ totalMin: 30, value: null, due: null, rate: null });
  });

  it("decision log: newest first, without the scope-baseline bookkeeping or sources", async () => {
    const p = await makeProject();
    const token = ok(await enablePortal(p.id))!;
    await db.insert(decisions).values([
      { projectId: p.id, decidedOn: "2026-06-18", title: "Scope baselined", detailsMd: "rates inside" },
      { projectId: p.id, decidedOn: "2026-07-10", title: "Rozmowy w Baserow", decidedBy: "both", sourceNote: "telegram 10.07" },
      { projectId: p.id, decidedOn: "2026-10-16", title: "Bot nie mówi o cenach", decidedBy: "Anna (client)" },
    ]);
    ok(await setPortalSection(p.id, "decisions", true));
    const log = (await getPortal(token))!.decisions!;
    expect(log.map((d) => d.title)).toEqual(["Bot nie mówi o cenach", "Rozmowy w Baserow"]);
    expect(JSON.stringify(log)).not.toContain("telegram");
  });

  it("turning off or replacing the link locks out the old one", async () => {
    const p = await makeProject();
    const first = ok(await enablePortal(p.id))!;
    const second = ok(await enablePortal(p.id))!;
    expect(await getPortal(first)).toBeNull();
    expect(await getPortal(second)).not.toBeNull();
    ok(await disablePortal(p.id));
    expect(await getPortal(second)).toBeNull();
  });

  it("ignores malformed tokens and archived projects", async () => {
    expect(await getPortal("x")).toBeNull();
    expect(await getPortal("' or 1=1 --" + "a".repeat(40))).toBeNull();
    const p = await makeProject({ archivedAt: new Date() });
    const token = ok(await enablePortal(p.id))!;
    expect(await getPortal(token)).toBeNull();
  });

  it("archived doc pages disappear from the portal", async () => {
    const p = await makeProject();
    const token = ok(await enablePortal(p.id))!;
    const page = ok(await createDocPage(p.id, "Spec"));
    ok(await setDocPagePublished(page, true));
    await db.update(docPages).set({ archivedAt: new Date() });
    expect((await getPortal(token))!.docs).toEqual([]);
  });

  it("refuses credentials in updates", async () => {
    const p = await makeProject();
    expect(await saveProjectUpdate(null, { projectId: p.id, title: "Access", bodyMd: "password: hunter22hunter" })).toMatchObject({
      ok: false,
    });
  });
});
