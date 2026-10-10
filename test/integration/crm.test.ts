import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { contacts, db, interactions, opportunities, organizations, projects } from "@/db";
import {
  convertOpportunityToProject,
  createLead,
  moveOpportunity,
  saveContact,
  saveInteraction,
  setOpportunityStage,
} from "@/server/crm-actions";
import { listClients, listFollowUps, listPipeline } from "@/server/crm-queries";
import { toDateString } from "@/lib/format";
import { form, makeOrg, ok, resetDb } from "../db";

beforeEach(resetDb);

const post = "Szukam kogoś do zrobienia sklepu na Shopify\nBudżet ok. 5k, termin listopad.";

describe("leads", () => {
  it("quick-add creates org, contact and opportunity from a pasted post", async () => {
    const id = ok(
      await createLead(
        form({
          originalPostMd: post,
          contactName: "Anna Nowak",
          contactEmail: "anna@example.com",
          sourceDetail: "Freelance PL",
          sourceUrl: "https://facebook.com/groups/x/posts/1",
          estValue: "5000",
        }),
      ),
    );
    const opp = await db.query.opportunities.findFirst({
      where: eq(opportunities.id, id),
      with: { org: true, contact: true },
    });
    expect(opp).toMatchObject({
      title: "Szukam kogoś do zrobienia sklepu na Shopify",
      stage: "new",
      source: "fb_group",
      estValue: 5000_00,
      org: { name: "Anna Nowak", kind: "person", status: "lead" },
      contact: { name: "Anna Nowak", emails: ["anna@example.com"] },
    });
  });

  it("reuses an existing contact with the same name", async () => {
    const org = await makeOrg({ name: "Bakery", status: "lead" });
    const [c] = await db.insert(contacts).values({ orgId: org.id, name: "Jan" }).returning();
    const id = ok(await createLead(form({ orgId: org.id, contactName: "Jan", title: "Second lead" })));
    const opp = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
    expect(opp!.contactId).toBe(c.id);
    expect(await db.select().from(contacts)).toHaveLength(1);
  });

  it("needs something to call the lead", async () => {
    expect(await createLead(form({}))).toEqual({ ok: false, error: "Give the lead a title or paste the post" });
  });

  it("truncates long first lines for the title", async () => {
    const id = ok(await createLead(form({ originalPostMd: "x".repeat(200), contactName: "A" })));
    const opp = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
    expect(opp!.title).toHaveLength(78);
    expect(opp!.title.endsWith("…")).toBe(true);
  });

  it("won leads turn the client active; closing clears the follow-up date", async () => {
    const id = ok(await createLead(form({ companyName: "Bakery", title: "Shop", nextActionAt: "2026-10-01" })));
    ok(await setOpportunityStage(id, "won"));
    const opp = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id), with: { org: true } });
    expect(opp).toMatchObject({ stage: "won", nextActionAt: null, org: { status: "active" } });
  });

  it("winning doesn't demote an internal client", async () => {
    const org = await makeOrg({ status: "internal" });
    const id = ok(await createLead(form({ orgId: org.id, title: "Idea" })));
    ok(await setOpportunityStage(id, "won"));
    expect((await db.query.organizations.findFirst({ where: eq(organizations.id, org.id) }))!.status).toBe("internal");
  });

  it("moving on the board persists stage and order", async () => {
    const a = ok(await createLead(form({ companyName: "A", title: "A" })));
    const b = ok(await createLead(form({ companyName: "B", title: "B" })));
    ok(await moveOpportunity(b, "call", [b]));
    ok(await moveOpportunity(a, "call", [a, b]));
    const rows = await listPipeline();
    expect(rows.map((r) => [r.title, r.stage, r.sortOrder])).toEqual([
      ["A", "call", 1000],
      ["B", "call", 2000],
    ]);
  });

  it("converting creates a fixed-price project and moves conversations onto it", async () => {
    const id = ok(await createLead(form({ companyName: "Bakery", title: "Shop", estValue: "5000", originalPostMd: post })));
    const opp = (await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) }))!;
    ok(await saveInteraction(null, form({ orgId: opp.orgId, opportunityId: id, bodyMd: "Hi!", direction: "out" })));

    const projectId = ok(await convertOpportunityToProject(id));
    const project = (await db.query.projects.findFirst({ where: eq(projects.id, projectId) }))!;
    expect(project).toMatchObject({ name: "Shop", pricing: "fixed", fixedPrice: 5000_00, orgId: opp.orgId });
    expect(project.notesMd).toContain("## Original request");
    expect((await db.select().from(interactions))[0].projectId).toBe(projectId);
    expect((await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) }))!.stage).toBe("won");

    // Converting again returns the same project.
    expect(ok(await convertOpportunityToProject(id))).toBe(projectId);
    expect(await db.select().from(projects)).toHaveLength(1);
  });
});

describe("interactions", () => {
  it("replying to a new lead moves it to contacted, internal notes don't", async () => {
    const a = ok(await createLead(form({ companyName: "A", title: "A" })));
    const b = ok(await createLead(form({ companyName: "B", title: "B" })));
    const orgOf = async (id: number) => (await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) }))!.orgId;
    ok(await saveInteraction(null, form({ orgId: await orgOf(a), opportunityId: a, bodyMd: "Hello", direction: "out" })));
    ok(await saveInteraction(null, form({ orgId: await orgOf(b), opportunityId: b, bodyMd: "Note", direction: "internal" })));
    const stages = Object.fromEntries((await listPipeline()).map((r) => [r.title, r.stage]));
    expect(stages).toEqual({ A: "contacted", B: "new" });
  });

  it("uses the given date and time", async () => {
    const org = await makeOrg();
    ok(await saveInteraction(null, form({ orgId: org.id, bodyMd: "x", date: "2026-10-05", time: "14:30" })));
    expect((await db.select().from(interactions))[0].occurredAt).toEqual(new Date(2026, 9, 5, 14, 30));
  });

  it("needs a body or a title, and a client", async () => {
    const org = await makeOrg();
    expect(await saveInteraction(null, form({ orgId: org.id }))).toMatchObject({ ok: false });
    expect(await saveInteraction(null, form({ bodyMd: "x" }))).toEqual({ ok: false, error: "Pick a client" });
  });
});

describe("follow-ups and clients", () => {
  it("lists open leads due today or earlier", async () => {
    const today = toDateString(new Date());
    ok(await createLead(form({ companyName: "Due", title: "Due", nextActionAt: today })));
    ok(await createLead(form({ companyName: "Later", title: "Later", nextActionAt: "2999-01-01" })));
    const won = ok(await createLead(form({ companyName: "Won", title: "Won", nextActionAt: "2020-01-01" })));
    await db.update(opportunities).set({ stage: "won" }).where(eq(opportunities.id, won));
    expect((await listFollowUps()).map((f) => f.title)).toEqual(["Due"]);
  });

  it("client list counts contacts, open leads and last contact", async () => {
    const org = await makeOrg({ name: "Bakery" });
    ok(await saveContact(null, form({ orgId: org.id, name: "Jan", emails: "jan@a.example, jan@b.example" })));
    ok(await createLead(form({ orgId: org.id, title: "Shop" })));
    ok(await saveInteraction(null, form({ orgId: org.id, bodyMd: "x", date: "2026-10-05", time: "10:00" })));
    const [row] = await listClients();
    expect(row).toMatchObject({ contactCount: 1, openOpps: 1, activeProjects: 0, monthMin: 0 });
    expect(row.lastContactAt).toEqual(new Date(2026, 9, 5, 10, 0));
    expect((await db.select().from(contacts))[0].emails).toEqual(["jan@a.example", "jan@b.example"]);
  });
});
