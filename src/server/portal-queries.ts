import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db, decisions, docPages, organizations, payments, projectUpdates, projects, tasks, timeEntries } from "@/db";

/** Decision written by "baseline scope": bookkeeping, not something agreed with the client. */
const BASELINE_TITLE = "Scope baselined";

/**
 * Everything the client portal shows, and nothing else: no notes, messages or internal docs.
 * Task progress, the hours report (hours, value, payments) and the decision log only when
 * switched on for the project. Null if the token doesn't match an active portal.
 * Cached per request (page and its metadata both read it).
 */
export const getPortal = cache(async (token: string) => {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      dueDate: projects.dueDate,
      pricing: projects.pricing,
      budgetHours: projects.budgetHours,
      currency: projects.currency,
      portalProgress: projects.portalProgress,
      portalHours: projects.portalHours,
      portalDecisions: projects.portalDecisions,
      lang: projects.portalLang,
      clientName: organizations.name,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .where(and(eq(projects.portalToken, token), isNull(projects.archivedAt)));
  if (!project) return null;

  const [counts, updates, docs, hours, decisionLog] = await Promise.all([
    project.portalProgress
      ? db
          .select({ status: tasks.status, count: sql<number>`count(*)::int` })
          .from(tasks)
          .where(eq(tasks.projectId, project.id))
          .groupBy(tasks.status)
      : null,
    db
      .select({ id: projectUpdates.id, title: projectUpdates.title, bodyMd: projectUpdates.bodyMd, publishedAt: projectUpdates.publishedAt })
      .from(projectUpdates)
      // An update without text says nothing to the client.
      .where(
        and(
          eq(projectUpdates.projectId, project.id),
          isNotNull(projectUpdates.publishedAt),
          sql`${projectUpdates.bodyMd} ~ '[^[:space:]]'`,
        ),
      )
      .orderBy(desc(projectUpdates.publishedAt)),
    db
      .select({ id: docPages.id, title: docPages.title, bodyMd: docPages.bodyMd, updatedAt: docPages.updatedAt })
      .from(docPages)
      .where(and(eq(docPages.projectId, project.id), eq(docPages.published, true), isNull(docPages.archivedAt)))
      .orderBy(asc(docPages.sortOrder), asc(docPages.id)),
    project.portalHours ? hoursReport(project) : null,
    project.portalDecisions
      ? db
          .select({ id: decisions.id, decidedOn: decisions.decidedOn, title: decisions.title, detailsMd: decisions.detailsMd, decidedBy: decisions.decidedBy })
          .from(decisions)
          .where(and(eq(decisions.projectId, project.id), ne(decisions.title, BASELINE_TITLE)))
          .orderBy(desc(decisions.decidedOn), desc(decisions.id))
      : null,
  ]);

  let progress = null;
  if (counts) {
    const by = Object.fromEntries(counts.map((c) => [c.status, c.count]));
    const total = counts.reduce((s, c) => s + c.count, 0);
    if (total > 0) progress = { total, done: by.done ?? 0, inProgress: (by.in_progress ?? 0) + (by.review ?? 0) };
  }
  return {
    name: project.name,
    lang: project.lang,
    clientName: project.clientName,
    status: project.status,
    dueDate: project.dueDate,
    progress,
    updates: updates.map((u) => ({ ...u, publishedAt: u.publishedAt! })),
    docs,
    hours,
    decisions: decisionLog,
  };
});
export type Portal = NonNullable<Awaited<ReturnType<typeof getPortal>>>;

/**
 * Billable hours with their notes, and for hourly projects the value of that work and the
 * payments against it. Entries carry no rates: only the totals are worked out from them.
 */
async function hoursReport(project: { id: number; pricing: string; budgetHours: number | null; currency: string }) {
  const [entries, paymentRows] = await Promise.all([
    db
      .select({ id: timeEntries.id, startedAt: timeEntries.startedAt, durationMin: timeEntries.durationMin, note: timeEntries.note, rate: timeEntries.rateSnapshot })
      .from(timeEntries)
      .where(and(eq(timeEntries.projectId, project.id), eq(timeEntries.billable, true)))
      .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id)),
    db
      .select({ id: payments.id, label: payments.label, amount: payments.amount, dueDate: payments.dueDate, paidAt: payments.paidAt })
      .from(payments)
      .where(eq(payments.projectId, project.id))
      .orderBy(sql`coalesce(${payments.paidAt}, ${payments.dueDate}) asc nulls last`, asc(payments.id)),
  ]);
  const totalMin = entries.reduce((s, e) => s + e.durationMin, 0);
  const hourly = project.pricing === "hourly";
  const value = hourly ? Math.round(entries.reduce((s, e) => s + (e.durationMin * (e.rate ?? 0)) / 60, 0)) : null;
  const paid = paymentRows.reduce((s, p) => s + (p.paidAt ? p.amount : 0), 0);
  const rates = new Set(entries.map((e) => e.rate));
  return {
    currency: project.currency,
    budgetHours: project.budgetHours,
    totalMin,
    // One rate for the whole project is worth stating; a mix of rates isn't.
    rate: hourly && rates.size === 1 ? [...rates][0] : null,
    value,
    paid,
    due: value === null ? null : value - paid,
    entries: entries.map((e) => ({ id: e.id, startedAt: e.startedAt, durationMin: e.durationMin, note: e.note })),
    payments: paymentRows,
  };
}

export async function listProjectUpdates(projectId: number) {
  return db.query.projectUpdates.findMany({
    where: eq(projectUpdates.projectId, projectId),
    orderBy: [desc(projectUpdates.createdAt)],
  });
}
