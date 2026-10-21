import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, decisions, docPages, docRevisions, openQuestions, projects, systems } from "@/db";
import { DOC_TEMPLATES } from "@/lib/doc-templates";
import {
  answerOpenQuestion,
  baselineScope,
  createDocPage,
  createDocsFromTemplate,
  saveBusinessRule,
  saveOpenQuestion,
  setBusinessRuleRetired,
  setOpenQuestionStatus,
  restoreRevision,
  saveChangeRequest,
  saveDecision,
  saveDocPage,
  saveSystem,
  setChangeRequestStatus,
  updateProjectBrief,
  updateProjectScope,
} from "@/server/doc-actions";
import {
  getDocPage,
  listBusinessRules,
  listChangeRequests,
  listDecisions,
  listDocPages,
  listOpenQuestions,
} from "@/server/doc-queries";
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

describe("doc templates", () => {
  it("adds unpublished pages and standard questions once, counting placeholders", async () => {
    const p = await makeProject();
    const template = DOC_TEMPLATES[0];
    ok(await createDocPage(p.id, "Notes"));
    expect(ok(await createDocsFromTemplate(p.id, template.id))).toEqual({
      pages: template.pages.length,
      questions: template.questions.length,
    });

    const pages = await listDocPages(p.id);
    expect(pages.map((x) => x.title)).toEqual(["Notes", ...template.pages.map((x) => x.title)]);
    expect(pages[0].todos).toBe(0);
    expect(pages[1].todos).toBeGreaterThan(5);
    expect((await db.select().from(docPages)).every((x) => !x.published)).toBe(true);
    const first = (await getDocPage(pages[1].id))!;
    expect(first.revisions.map((r) => r.note)).toEqual([`From template “${template.name}”`]);

    // Running it again (e.g. after deleting one page) only fills the gaps.
    await db.delete(docPages).where(eq(docPages.id, pages[2].id));
    expect(ok(await createDocsFromTemplate(p.id, template.id))).toEqual({ pages: 1, questions: 0 });
    expect((await listOpenQuestions(p.id)).map((q) => q.code)).toEqual(
      template.questions.map((_, i) => `Q-${String(i + 1).padStart(2, "0")}`),
    );
    expect(await createDocsFromTemplate(p.id, "nope")).toEqual({ ok: false, error: "Unknown template" });
  });
});

describe("open questions", () => {
  it("numbers questions, refuses duplicate codes and drops/reopens", async () => {
    const p = await makeProject();
    ok(await saveOpenQuestion(null, form({ projectId: p.id, question: "Retention?", owner: "Anna", dueDate: "2026-11-01" })));
    ok(await saveOpenQuestion(null, form({ projectId: p.id, question: "Error channel?", code: "q 7" })));
    ok(await saveOpenQuestion(null, form({ projectId: p.id, question: "Who signs off?" })));
    expect((await listOpenQuestions(p.id)).map((q) => [q.code, q.question])).toEqual([
      ["Q-01", "Retention?"], // has a due date, so it comes first
      ["Q-07", "Error channel?"],
      ["Q-08", "Who signs off?"],
    ]);
    expect(await saveOpenQuestion(null, form({ projectId: p.id, question: "Dup", code: "Q-01" }))).toEqual({
      ok: false,
      error: "Q-01 is already used in this project",
    });

    const [q] = await listOpenQuestions(p.id);
    ok(await saveOpenQuestion(q.id, form({ question: "Retention of recordings?" })));
    expect((await listOpenQuestions(p.id))[0]).toMatchObject({ code: "Q-01", question: "Retention of recordings?" });

    ok(await setOpenQuestionStatus(q.id, "dropped"));
    let row = (await listOpenQuestions(p.id)).find((x) => x.id === q.id)!;
    expect([row.status, row.closedOn]).toEqual(["dropped", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    ok(await setOpenQuestionStatus(q.id, "open"));
    row = (await listOpenQuestions(p.id)).find((x) => x.id === q.id)!;
    expect([row.status, row.closedOn]).toEqual(["open", null]);
    expect(await setOpenQuestionStatus(q.id, "answered")).toEqual({ ok: false, error: "Bad status" });
  });

  it("answering can log a linked decision", async () => {
    const p = await makeProject();
    ok(await saveOpenQuestion(null, form({ projectId: p.id, question: "Keep recordings how long?" })));
    ok(await saveOpenQuestion(null, form({ projectId: p.id, question: "Logo colour?" })));
    const [q1, q2] = await listOpenQuestions(p.id);

    ok(
      await answerOpenQuestion(
        q1.id,
        form({ answerMd: "90 days, then delete.\nAlso tell callers.", logDecision: "on", decidedBy: "Anna", decidedOn: "2026-10-20" }),
      ),
    );
    ok(await answerOpenQuestion(q2.id, form({ answerMd: "Blue" })));

    const [decision] = await listDecisions(p.id);
    expect(decision).toMatchObject({
      title: "90 days, then delete.",
      decidedBy: "Anna",
      decidedOn: "2026-10-20",
      sourceNote: "Q-01",
      detailsMd: "Q-01: Keep recordings how long?\n\n90 days, then delete.\nAlso tell callers.",
    });
    const rows = await listOpenQuestions(p.id);
    expect(rows.map((q) => [q.code, q.status, q.closedOn, q.decision?.title ?? null])).toEqual([
      ["Q-01", "answered", "2026-10-20", "90 days, then delete."],
      ["Q-02", "answered", expect.any(String), null],
    ]);
    expect(await answerOpenQuestion(q2.id, form({ answerMd: "api_key=sk-abcdefabcdefabcdef1234" }))).toMatchObject({ ok: false });
    expect(await db.select().from(openQuestions)).toHaveLength(2);
  });
});

describe("business rules", () => {
  it("links rules to decisions of the same project and lists retired ones last", async () => {
    const p = await makeProject();
    const other = await makeProject({ name: "Other" });
    ok(await saveDecision(null, form({ projectId: p.id, title: "No prices on the phone", decidedOn: "2026-10-16" })));
    ok(await saveDecision(null, form({ projectId: other.id, title: "Elsewhere" })));
    const [mine] = await listDecisions(p.id);
    const [theirs] = await listDecisions(other.id);

    ok(
      await saveBusinessRule(
        null,
        form({ projectId: p.id, title: "Bot never quotes prices", sourceDecisionId: mine.id, implementedIn: "main prompt" }),
      ),
    );
    ok(await saveBusinessRule(null, form({ projectId: p.id, title: "Delivery = 2 working days", kind: "computation" })));
    expect(await saveBusinessRule(null, form({ projectId: p.id, title: "X", sourceDecisionId: theirs.id }))).toEqual({
      ok: false,
      error: "That decision isn't in this project",
    });

    let rules = await listBusinessRules(p.id);
    expect(rules.map((r) => [r.code, r.kind, r.sourceDecision?.title ?? null])).toEqual([
      ["BR-01", "constraint", "No prices on the phone"],
      ["BR-02", "computation", null],
    ]);

    ok(await setBusinessRuleRetired(rules[0].id, true));
    rules = await listBusinessRules(p.id);
    expect(rules.map((r) => [r.code, r.retiredAt != null])).toEqual([
      ["BR-02", false],
      ["BR-01", true],
    ]);
    // Editing keeps the code; deleting the decision keeps the rule.
    ok(await saveBusinessRule(rules[1].id, form({ title: "Bot never quotes prices or margins" })));
    await db.delete(decisions).where(eq(decisions.id, mine.id));
    expect((await listBusinessRules(p.id)).find((r) => r.code === "BR-01")).toMatchObject({
      title: "Bot never quotes prices or margins",
      sourceDecisionId: null,
    });
  });
});
