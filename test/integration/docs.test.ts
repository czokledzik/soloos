import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, decisions, docRevisions, projects, systems } from "@/db";
import {
  baselineScope,
  createDocPage,
  restoreRevision,
  saveChangeRequest,
  saveDecision,
  saveDocPage,
  saveSystem,
  setChangeRequestStatus,
  updateProjectBrief,
  updateProjectScope,
} from "@/server/doc-actions";
import { getDocPage, listChangeRequests, listDecisions, listDocPages } from "@/server/doc-queries";
import { form, makeProject, ok, resetDb } from "../db";

beforeEach(resetDb);

describe("brief and scope", () => {
  it("saves the brief and refuses credentials", async () => {
    const p = await makeProject();
    ok(await updateProjectBrief(p.id, "Shop for a bakery. Next.js + Shopify."));
    expect((await db.query.projects.findFirst({ where: eq(projects.id, p.id) }))!.briefMd).toContain("bakery");
    expect(await updateProjectBrief(p.id, "admin password: hunter2hunter2")).toEqual({
      ok: false,
      error: "That looks like a password or key. Keep credentials in a password manager, not in SoloOS.",
    });
  });

  it("baselining needs a scope and logs a decision", async () => {
    const p = await makeProject();
    expect(await baselineScope(p.id)).toEqual({ ok: false, error: "Write the scope first" });
    ok(await updateProjectScope(p.id, "- 5 pages\n- contact form"));
    ok(await baselineScope(p.id));
    expect((await db.query.projects.findFirst({ where: eq(projects.id, p.id) }))!.scopeBaselinedAt).toBeInstanceOf(Date);
    expect((await listDecisions(p.id)).map((d) => d.title)).toEqual(["Scope baselined"]);
  });
});

describe("decisions", () => {
  it("records decisions newest first", async () => {
    const p = await makeProject();
    ok(await saveDecision(null, form({ projectId: p.id, title: "Use Shopify", decidedOn: "2026-10-01", decidedBy: "Anna" })));
    ok(await saveDecision(null, form({ projectId: p.id, title: "Drop the blog", decidedOn: "2026-10-05", sourceNote: "call" })));
    expect((await listDecisions(p.id)).map((d) => [d.decidedOn, d.title, d.decidedBy, d.sourceNote])).toEqual([
      ["2026-10-05", "Drop the blog", null, "call"],
      ["2026-10-01", "Use Shopify", "Anna", null],
    ]);
  });
});

describe("change requests", () => {
  it("reads signed hours and money", async () => {
    const p = await makeProject();
    ok(
      await saveChangeRequest(
        null,
        form({ projectId: p.id, title: "Add blog", hoursImpact: "+6h", priceImpact: "1 800", requestedBy: "Anna" }),
      ),
    );
    ok(await saveChangeRequest(null, form({ projectId: p.id, title: "No newsletter", hoursImpact: "-1:30", priceImpact: "-450" })));
    const rows = await listChangeRequests(p.id);
    expect(rows.map((r) => [r.title, r.hoursImpactMin, r.priceImpact, r.status]).sort()).toEqual([
      ["Add blog", 360, 1800_00, "proposed"],
      ["No newsletter", -90, -450_00, "proposed"],
    ]);
    expect(await saveChangeRequest(null, form({ projectId: p.id, title: "X", hoursImpact: "lots" }))).toEqual({
      ok: false,
      error: `Can't read "lots" as hours (use e.g. 2h, -1:30, 45m)`,
    });
  });

  it("approving dates it and adds a decision; back to proposed clears the date", async () => {
    const p = await makeProject();
    ok(await saveChangeRequest(null, form({ projectId: p.id, title: "Add blog", requestedBy: "Anna" })));
    const [cr] = await listChangeRequests(p.id);
    ok(await setChangeRequestStatus(cr.id, "approved"));
    const [after] = await listChangeRequests(p.id);
    expect(after.status).toBe("approved");
    expect(after.decidedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await listDecisions(p.id)).map((d) => [d.title, d.decidedBy])).toEqual([["Approved change: Add blog", "Anna"]]);

    ok(await setChangeRequestStatus(cr.id, "proposed"));
    expect((await listChangeRequests(p.id))[0].decidedOn).toBeNull();
    expect(await db.select().from(decisions)).toHaveLength(1);
  });
});

describe("doc pages", () => {
  it("keeps revisions, folding quick saves together", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const p = await makeProject();
      const id = ok(await createDocPage(p.id, "Architecture"));
      vi.setSystemTime(new Date("2026-10-09T10:00:00Z"));
      ok(await saveDocPage(id, { title: "Architecture", bodyMd: "v1" }));
      ok(await saveDocPage(id, { title: "Architecture", bodyMd: "v1 + typo fix" }));
      // Rows get created_at from the database clock, so age the revision explicitly.
      await db.update(docRevisions).set({ createdAt: new Date("2026-10-09T10:00:00Z") });
      vi.setSystemTime(new Date("2026-10-09T10:30:00Z"));
      ok(await saveDocPage(id, { title: "Architecture", bodyMd: "v2" }));
      ok(await saveDocPage(id, { title: "Architecture", bodyMd: "v2" })); // no change, no revision
      ok(await saveDocPage(id, { title: "Architecture", bodyMd: "v3", note: "After the call" }));

      const page = (await getDocPage(id))!;
      expect(page.bodyMd).toBe("v3");
      expect(page.revisions.map((r) => [r.bodyMd, r.note])).toEqual([
        ["v3", "After the call"],
        ["v2", null],
        ["v1 + typo fix", null],
      ]);

      ok(await restoreRevision(page.revisions[2].id));
      const restored = (await getDocPage(id))!;
      expect(restored.bodyMd).toBe("v1 + typo fix");
      expect(restored.revisions[0].note).toMatch(/^Restored version from /);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists pages in creation order and needs titles", async () => {
    const p = await makeProject();
    ok(await createDocPage(p.id, "Brief"));
    ok(await createDocPage(p.id, "Diagrams"));
    expect((await listDocPages(p.id)).map((d) => d.title)).toEqual(["Brief", "Diagrams"]);
    expect(await createDocPage(p.id, " ")).toEqual({ ok: false, error: "Give the page a title" });
  });
});

describe("systems", () => {
  it("stores links, refuses secrets and non-http links", async () => {
    const p = await makeProject();
    ok(await saveSystem(null, form({ projectId: p.id, kind: "repo", name: "Shop repo", url: "https://github.com/x/shop" })));
    expect(await db.select().from(systems)).toHaveLength(1);
    expect(
      await saveSystem(null, form({ projectId: p.id, name: "DB", url: "postgres://u:secretpw@host/db" })),
    ).toMatchObject({ ok: false, error: "Links must start with http:// or https://" });
    expect(
      await saveSystem(null, form({ projectId: p.id, name: "n8n", url: "https://admin:secretpw@n8n.example.com" })),
    ).toMatchObject({ ok: false, error: expect.stringContaining("a password inside a URL") });
    expect(await saveSystem(null, form({ projectId: p.id, name: "Twilio", notes: "token=abcdef123456" }))).toMatchObject({
      ok: false,
    });
  });
});
