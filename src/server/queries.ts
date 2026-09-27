import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, ne, sql } from "drizzle-orm";
import { startOfMonth } from "date-fns";
import {
  db,
  organizations,
  payments,
  projects,
  tasks,
  timeEntries,
} from "@/db";

export async function getRunningTimer() {
  return (
    (await db.query.runningTimer.findFirst({
      with: { project: { with: { org: true } }, task: true },
    })) ?? null
  );
}
export type RunningTimer = NonNullable<Awaited<ReturnType<typeof getRunningTimer>>>;

export async function listOrganizations() {
  return db.query.organizations.findMany({
    where: isNull(organizations.archivedAt),
    orderBy: [asc(organizations.name)],
  });
}

/** Projects with their client and tracked minutes (total and this month). */
export async function listProjects() {
  const monthStart = startOfMonth(new Date());
  const rows = await db
    .select({
      project: projects,
      org: organizations,
      totalMin: sql<number>`coalesce(sum(${timeEntries.durationMin}), 0)::int`,
      monthMin: sql<number>`coalesce(sum(${timeEntries.durationMin}) filter (where ${timeEntries.startedAt} >= ${monthStart.toISOString()}::timestamptz), 0)::int`,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .leftJoin(timeEntries, eq(timeEntries.projectId, projects.id))
    .where(isNull(projects.archivedAt))
    .groupBy(projects.id, organizations.id)
    .orderBy(asc(organizations.name), asc(projects.name));

  const openCounts = await db
    .select({
      projectId: tasks.projectId,
      open: sql<number>`count(*) filter (where ${tasks.status} <> 'done')::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .groupBy(tasks.projectId);
  const counts = new Map(openCounts.map((c) => [c.projectId, c]));

  return rows.map((r) => ({
    ...r,
    openTasks: counts.get(r.project.id)?.open ?? 0,
    doneTasks: counts.get(r.project.id)?.done ?? 0,
  }));
}
export type ProjectRow = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(id: number) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    with: { org: true },
  });
  if (!project) return null;
  const [{ totalMin, billableMin, value }] = await db
    .select({
      totalMin: sql<number>`coalesce(sum(${timeEntries.durationMin}), 0)::int`,
      billableMin: sql<number>`coalesce(sum(${timeEntries.durationMin}) filter (where ${timeEntries.billable}), 0)::int`,
      value: sql<number>`coalesce(sum(round(${timeEntries.durationMin} / 60.0 * ${timeEntries.rateSnapshot})) filter (where ${timeEntries.billable}), 0)::int`,
    })
    .from(timeEntries)
    .where(eq(timeEntries.projectId, id));
  return { ...project, totalMin, billableMin, value };
}
export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;

/** Tasks for a project with minutes tracked per task. */
export async function listProjectTasks(projectId: number) {
  return tasksWithTime(eq(tasks.projectId, projectId));
}

/** Open tasks across all non-archived projects. */
export async function listOpenTasks() {
  return tasksWithTime(
    and(ne(tasks.status, "done"), isNull(projects.archivedAt), ne(projects.status, "archived")),
  );
}

async function tasksWithTime(where: ReturnType<typeof and>) {
  const trackedMin = db
    .select({
      taskId: timeEntries.taskId,
      min: sql<number>`sum(${timeEntries.durationMin})::int`.as("min"),
    })
    .from(timeEntries)
    .groupBy(timeEntries.taskId)
    .as("tracked");
  const rows = await db
    .select({
      task: tasks,
      projectName: projects.name,
      orgName: organizations.name,
      trackedMin: sql<number>`coalesce(${trackedMin.min}, 0)::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .leftJoin(trackedMin, eq(trackedMin.taskId, tasks.id))
    .where(where)
    .orderBy(asc(tasks.sortOrder), asc(tasks.id));
  return rows.map((r) => ({ ...r.task, projectName: r.projectName, orgName: r.orgName, trackedMin: r.trackedMin }));
}
export type TaskRow = Awaited<ReturnType<typeof listProjectTasks>>[number];

export async function getTask(id: number) {
  const rows = await tasksWithTime(eq(tasks.id, id));
  return rows[0] ?? null;
}

export async function listTimeEntries(opts: { from: Date; to: Date; projectId?: number }) {
  return db.query.timeEntries.findMany({
    where: and(
      gte(timeEntries.startedAt, opts.from),
      lt(timeEntries.startedAt, opts.to),
      opts.projectId ? eq(timeEntries.projectId, opts.projectId) : undefined,
    ),
    with: { project: { with: { org: true } }, task: true },
    orderBy: [desc(timeEntries.startedAt)],
  });
}
export type TimeEntryRow = Awaited<ReturnType<typeof listTimeEntries>>[number];

export async function listProjectEntries(projectId: number) {
  return db.query.timeEntries.findMany({
    where: eq(timeEntries.projectId, projectId),
    with: { project: { with: { org: true } }, task: true },
    orderBy: [desc(timeEntries.startedAt)],
    limit: 500,
  });
}

export async function listPayments(projectId: number) {
  return db.query.payments.findMany({
    where: eq(payments.projectId, projectId),
    orderBy: [asc(payments.dueDate), asc(payments.id)],
  });
}

/** Lightweight lists for pickers and the command palette. */
export async function getPickerData() {
  const [projectList, taskList] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        orgName: organizations.name,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .where(and(isNull(projects.archivedAt), ne(projects.status, "archived")))
      .orderBy(asc(organizations.name), asc(projects.name)),
    db
      .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, status: tasks.status })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(ne(tasks.status, "done"), isNull(projects.archivedAt)))
      .orderBy(desc(tasks.updatedAt))
      .limit(1000),
  ]);
  return { projects: projectList, tasks: taskList };
}
export type PickerData = Awaited<ReturnType<typeof getPickerData>>;

/** Minutes per client for a period, plus billable value per currency. */
export async function minutesByClient(from: Date, to: Date) {
  return db
    .select({
      orgId: organizations.id,
      orgName: organizations.name,
      minutes: sql<number>`sum(${timeEntries.durationMin})::int`,
      billableMin: sql<number>`coalesce(sum(${timeEntries.durationMin}) filter (where ${timeEntries.billable}), 0)::int`,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(timeEntries.projectId, projects.id))
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .where(and(gte(timeEntries.startedAt, from), lt(timeEntries.startedAt, to)))
    .groupBy(organizations.id)
    .orderBy(desc(sql`sum(${timeEntries.durationMin})`));
}

export async function getOrganization(id: number) {
  return (
    (await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
      with: { contacts: true },
    })) ?? null
  );
}
