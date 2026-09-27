import "server-only";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { db, organizations, payments, projects, tasks, timeEntries } from "@/db";

export type ReportFilters = {
  from: Date;
  to: Date;
  orgId?: number;
  projectId?: number;
  billable?: boolean;
};

/** Flat time entries with client/project/task names for reports and CSV. */
export async function getReportEntries(f: ReportFilters) {
  return db
    .select({
      id: timeEntries.id,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationMin: timeEntries.durationMin,
      note: timeEntries.note,
      billable: timeEntries.billable,
      rateSnapshot: timeEntries.rateSnapshot,
      projectId: projects.id,
      projectName: projects.name,
      currency: projects.currency,
      orgId: organizations.id,
      orgName: organizations.name,
      taskId: tasks.id,
      taskTitle: tasks.title,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(timeEntries.projectId, projects.id))
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
    .where(
      and(
        gte(timeEntries.startedAt, f.from),
        lt(timeEntries.startedAt, f.to),
        f.orgId ? eq(organizations.id, f.orgId) : undefined,
        f.projectId ? eq(projects.id, f.projectId) : undefined,
        f.billable === undefined ? undefined : eq(timeEntries.billable, f.billable),
      ),
    )
    .orderBy(asc(timeEntries.startedAt));
}
export type ReportEntry = Awaited<ReturnType<typeof getReportEntries>>[number];

/** Fixed-price projects (optionally for one client) with all-time hours and payments. */
export async function getFixedPriceProjects(orgId?: number) {
  const rows = await db.query.projects.findMany({
    where: and(
      eq(projects.pricing, "fixed"),
      isNull(projects.archivedAt),
      orgId ? eq(projects.orgId, orgId) : undefined,
    ),
    with: { org: true, payments: true, timeEntries: { columns: { durationMin: true } } },
    orderBy: [asc(projects.name)],
  });
  return rows.map(({ timeEntries: entries, ...p }) => ({
    ...p,
    totalMin: entries.reduce((s, e) => s + e.durationMin, 0),
  }));
}

/** Unpaid scheduled payments, soonest first. */
export async function getUnpaidPayments(orgId?: number) {
  return db
    .select({
      id: payments.id,
      label: payments.label,
      amount: payments.amount,
      dueDate: payments.dueDate,
      projectId: projects.id,
      projectName: projects.name,
      currency: projects.currency,
      orgName: organizations.name,
    })
    .from(payments)
    .innerJoin(projects, eq(payments.projectId, projects.id))
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .where(and(isNull(payments.paidAt), orgId ? eq(organizations.id, orgId) : undefined))
    .orderBy(asc(payments.dueDate));
}
