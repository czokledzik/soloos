import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, notInArray, or, sql } from "drizzle-orm";
import { unionAll, type AnyPgColumn } from "drizzle-orm/pg-core";
import { startOfMonth, subDays } from "date-fns";
import {
  contacts,
  db,
  interactions,
  opportunities,
  organizations,
  projects,
  threads,
  timeEntries,
} from "@/db";
import { toDateString } from "@/lib/format";

const OPEN_STAGES = ["new", "contacted", "call", "proposal", "negotiating"] as const;

const contactAt = (col: AnyPgColumn) => sql<Date | null>`${col}`.as("at");

/** Last logged conversation or message per org / opportunity, as subqueries. */
function lastContactByOrg() {
  const all = unionAll(
    db.select({ orgId: interactions.orgId, at: contactAt(interactions.occurredAt) }).from(interactions),
    db.select({ orgId: threads.orgId, at: contactAt(threads.lastMessageAt) }).from(threads),
  ).as("contact_org");
  return db
    .select({ orgId: all.orgId, at: max(all.at).as("last_org_at") })
    .from(all)
    .groupBy(all.orgId)
    .as("last_org");
}

function lastContactByOpportunity() {
  const all = unionAll(
    db.select({ oppId: interactions.opportunityId, at: contactAt(interactions.occurredAt) }).from(interactions),
    db.select({ oppId: threads.opportunityId, at: contactAt(threads.lastMessageAt) }).from(threads),
  ).as("contact_opp");
  return db
    .select({ oppId: all.oppId, at: max(all.at).as("last_opp_at") })
    .from(all)
    .groupBy(all.oppId)
    .as("last_opp");
}

/** Open opportunities plus those closed in the last 30 days. */
export async function listPipeline() {
  const last = lastContactByOpportunity();
  const rows = await db
    .select({
      opp: opportunities,
      orgName: organizations.name,
      currency: organizations.currency,
      contactName: contacts.name,
      lastContactAt: last.at,
    })
    .from(opportunities)
    .innerJoin(organizations, eq(opportunities.orgId, organizations.id))
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .leftJoin(last, eq(last.oppId, opportunities.id))
    .where(
      or(
        inArray(opportunities.stage, [...OPEN_STAGES]),
        gte(opportunities.updatedAt, subDays(new Date(), 30)),
      ),
    )
    .orderBy(asc(opportunities.sortOrder), desc(opportunities.createdAt));
  return rows.map((r) => ({
    ...r.opp,
    orgName: r.orgName,
    currency: r.currency,
    contactName: r.contactName,
    lastContactAt: r.lastContactAt ? new Date(r.lastContactAt) : null,
  }));
}
export type PipelineRow = Awaited<ReturnType<typeof listPipeline>>[number];

export async function getOpportunity(id: number) {
  return (
    (await db.query.opportunities.findFirst({
      where: eq(opportunities.id, id),
      with: {
        org: { with: { contacts: true } },
        contact: true,
        project: true,
      },
    })) ?? null
  );
}
export type OpportunityDetail = NonNullable<Awaited<ReturnType<typeof getOpportunity>>>;

/** Opportunities whose next action is due today or earlier. */
export async function listFollowUps() {
  return db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      nextAction: opportunities.nextAction,
      nextActionAt: opportunities.nextActionAt,
      orgId: organizations.id,
      orgName: organizations.name,
    })
    .from(opportunities)
    .innerJoin(organizations, eq(opportunities.orgId, organizations.id))
    .where(
      and(
        inArray(opportunities.stage, [...OPEN_STAGES]),
        lte(opportunities.nextActionAt, toDateString(new Date())),
      ),
    )
    .orderBy(asc(opportunities.nextActionAt));
}

export async function listInteractions(where: {
  orgId?: number;
  opportunityId?: number;
  projectId?: number;
}) {
  return db.query.interactions.findMany({
    where: and(
      where.orgId ? eq(interactions.orgId, where.orgId) : undefined,
      where.opportunityId ? eq(interactions.opportunityId, where.opportunityId) : undefined,
      where.projectId ? eq(interactions.projectId, where.projectId) : undefined,
    ),
    with: { contact: true, opportunity: true, project: true },
    orderBy: [desc(interactions.occurredAt), desc(interactions.id)],
  });
}
export type InteractionRow = Awaited<ReturnType<typeof listInteractions>>[number];

/** Clients list with activity stats. */
export async function listClients() {
  const last = lastContactByOrg();
  const monthStart = startOfMonth(new Date());
  const rows = await db
    .select({
      org: organizations,
      lastContactAt: last.at,
      contactCount: sql<number>`(select count(*) from ${contacts} where ${contacts.orgId} = ${organizations.id})::int`,
      openOpps: sql<number>`(select count(*) from ${opportunities} where ${opportunities.orgId} = ${organizations.id} and ${opportunities.stage} not in ('won', 'lost'))::int`,
      activeProjects: sql<number>`(select count(*) from ${projects} where ${projects.orgId} = ${organizations.id} and ${projects.status} = 'active' and ${projects.archivedAt} is null)::int`,
      monthMin: sql<number>`(select coalesce(sum(${timeEntries.durationMin}), 0) from ${timeEntries} join ${projects} on ${projects.id} = ${timeEntries.projectId} where ${projects.orgId} = ${organizations.id} and ${timeEntries.startedAt} >= ${monthStart.toISOString()}::timestamptz)::int`,
    })
    .from(organizations)
    .leftJoin(last, eq(last.orgId, organizations.id))
    .where(isNull(organizations.archivedAt))
    .orderBy(asc(organizations.name));
  return rows.map((r) => ({ ...r, lastContactAt: r.lastContactAt ? new Date(r.lastContactAt) : null }));
}
export type ClientRow = Awaited<ReturnType<typeof listClients>>[number];

export async function listOrgOpportunities(orgId: number) {
  return db.query.opportunities.findMany({
    where: eq(opportunities.orgId, orgId),
    orderBy: [desc(opportunities.createdAt)],
  });
}

/** Small lists for pickers in the interaction / lead forms. */
export async function getCrmPickers() {
  const [orgs, opps, contactList] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(isNull(organizations.archivedAt))
      .orderBy(asc(organizations.name)),
    db
      .select({ id: opportunities.id, title: opportunities.title, orgId: opportunities.orgId, stage: opportunities.stage })
      .from(opportunities)
      .where(notInArray(opportunities.stage, ["lost"]))
      .orderBy(desc(opportunities.createdAt)),
    db
      .select({ id: contacts.id, name: contacts.name, orgId: contacts.orgId })
      .from(contacts)
      .orderBy(asc(contacts.name)),
  ]);
  return { orgs, opportunities: opps, contacts: contactList };
}
export type CrmPickers = Awaited<ReturnType<typeof getCrmPickers>>;
