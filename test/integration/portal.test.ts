import { beforeEach, describe, expect, it } from "vitest";
import { db, docPages, timeEntries } from "@/db";
import { createDocPage, saveDocPage } from "@/server/doc-actions";
import {
  disablePortal,
  enablePortal,
  saveProjectUpdate,
  setDocPagePublished,
  setUpdatePublished,
} from "@/server/portal-actions";
import { getPortal } from "@/server/portal-queries";
import { makeOrg, makeProject, makeTask, ok, resetDb } from "../db";

beforeEach(resetDb);

describe("client portal", () => {
  it("shows only published updates and docs, plus task progress", async () => {
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
      progress: { total: 3, done: 1, inProgress: 1 },
      updates: [{ title: "Week 1", bodyMd: "Form done" }],
      docs: [{ title: "Flow" }],
    });
    // Nothing internal leaks into what the page receives.
    const json = JSON.stringify(portal);
    for (const secret of ["slow to pay", "Draft", "Internal notes", "20000", "600"]) expect(json).not.toContain(secret);
    expect(draft).toBeTypeOf("number");
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
