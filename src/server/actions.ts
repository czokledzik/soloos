"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  contractType,
  db,
  orgStatus,
  organizations,
  payments,
  pricing,
  projectStatus,
  projects,
  runningTimer,
  taskStatus,
  tasks,
  timeEntries,
  type TaskStatus,
} from "@/db";
import { isBillableByDefault, resolveRate } from "@/lib/billing";
import { parseDuration } from "@/lib/format";
import { ActionError, int, money, oneOf, reqStr, run, str } from "./form";

// Single-user app: every page renders fresh from the DB, so refreshing the
// whole tree after a mutation is cheap and keeps everything consistent.
function refreshAll() {
  revalidatePath("/", "layout");
}

async function projectWithOrg(projectId: number) {
  const p = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: { org: true },
  });
  if (!p) throw new ActionError("Project not found");
  return p;
}

// ---------- Organizations ----------

export async function createOrganization(fd: FormData) {
  return run(async () => {
    const [org] = await db
      .insert(organizations)
      .values({
        name: reqStr(fd, "name"),
        kind: oneOf(fd, "kind", ["company", "person"] as const) ?? "company",
        status: oneOf(fd, "status", orgStatus.enumValues) ?? "active",
        website: str(fd, "website"),
        defaultRate: money(fd, "defaultRate"),
        currency: str(fd, "currency") ?? "PLN",
      })
      .returning({ id: organizations.id });
    refreshAll();
    return org.id;
  });
}

// ---------- Projects ----------

function projectValues(fd: FormData) {
  return {
    name: reqStr(fd, "name"),
    status: oneOf(fd, "status", projectStatus.enumValues) ?? "active",
    contractType: oneOf(fd, "contractType", contractType.enumValues),
    pricing: oneOf(fd, "pricing", pricing.enumValues) ?? "hourly",
    hourlyRate: money(fd, "hourlyRate"),
    fixedPrice: money(fd, "fixedPrice"),
    budgetHours: int(fd, "budgetHours"),
    currency: str(fd, "currency") ?? "PLN",
    startDate: str(fd, "startDate"),
    dueDate: str(fd, "dueDate"),
  };
}

export async function createProject(fd: FormData) {
  return run(async () => {
    let orgId = int(fd, "orgId");
    const newOrgName = str(fd, "newOrgName");
    if (!orgId && newOrgName) {
      const [org] = await db
        .insert(organizations)
        .values({ name: newOrgName, status: "active" })
        .returning({ id: organizations.id });
      orgId = org.id;
    }
    if (!orgId) throw new ActionError("Pick a client or enter a new client name");
    const [p] = await db
      .insert(projects)
      .values({ orgId, ...projectValues(fd) })
      .returning({ id: projects.id });
    refreshAll();
    return p.id;
  });
}

export async function updateProject(id: number, fd: FormData) {
  return run(async () => {
    const orgId = int(fd, "orgId");
    await db
      .update(projects)
      .set({ ...projectValues(fd), ...(orgId ? { orgId } : {}) })
      .where(eq(projects.id, id));
    refreshAll();
  });
}

export async function updateProjectNotes(id: number, notesMd: string) {
  return run(async () => {
    await db.update(projects).set({ notesMd }).where(eq(projects.id, id));
    refreshAll();
  });
}

// ---------- Tasks ----------

export async function createTask(fd: FormData) {
  return run(async () => {
    const projectId = int(fd, "projectId");
    if (!projectId) throw new ActionError("Pick a project");
    const status = oneOf(fd, "status", taskStatus.enumValues) ?? "todo";
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${tasks.sortOrder}), 0)` })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
    const [t] = await db
      .insert(tasks)
      .values({
        projectId,
        title: reqStr(fd, "title"),
        status,
        priority: int(fd, "priority") ?? 0,
        dueDate: str(fd, "dueDate"),
        estimateMin: str(fd, "estimate") ? parseDuration(str(fd, "estimate")!) : null,
        sortOrder: Number(max) + 1000,
        completedAt: status === "done" ? new Date() : null,
      })
      .returning({ id: tasks.id });
    refreshAll();
    return t.id;
  });
}

export type TaskPatch = Partial<{
  title: string;
  bodyMd: string;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  estimateMin: number | null;
  projectId: number;
}>;

export async function updateTask(id: number, patch: TaskPatch) {
  return run(async () => {
    if (patch.title !== undefined && !patch.title.trim()) throw new ActionError("Title is required");
    if (patch.status && !taskStatus.enumValues.includes(patch.status)) throw new ActionError("Bad status");
    const extra =
      patch.status === undefined
        ? {}
        : { completedAt: patch.status === "done" ? new Date() : null };
    await db
      .update(tasks)
      .set({ ...patch, ...extra })
      .where(eq(tasks.id, id));
    refreshAll();
  });
}

/** Move a task to a status column, then persist the column's order. */
export async function moveTask(id: number, status: TaskStatus, orderedIds: number[]) {
  return run(async () => {
    if (!taskStatus.enumValues.includes(status)) throw new ActionError("Bad status");
    await db.transaction(async (tx) => {
      const current = await tx.query.tasks.findFirst({ where: eq(tasks.id, id) });
      if (!current) throw new ActionError("Task not found");
      if (current.status !== status) {
        await tx
          .update(tasks)
          .set({ status, completedAt: status === "done" ? new Date() : null })
          .where(eq(tasks.id, id));
      }
      for (const [i, taskId] of orderedIds.entries()) {
        await tx
          .update(tasks)
          .set({ sortOrder: (i + 1) * 1000 })
          .where(eq(tasks.id, taskId));
      }
    });
    refreshAll();
  });
}

export async function deleteTask(id: number) {
  return run(async () => {
    await db.delete(tasks).where(eq(tasks.id, id));
    refreshAll();
  });
}

// ---------- Timer ----------

/** Stop the running timer (if any), writing a time entry. Returns the entry id. */
async function stopRunning(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const [timer] = await tx.delete(runningTimer).returning();
  if (!timer) return null;
  const endedAt = new Date();
  const durationMin = Math.round((endedAt.getTime() - timer.startedAt.getTime()) / 60000);
  if (durationMin < 1) return null;
  const project = await tx.query.projects.findFirst({
    where: eq(projects.id, timer.projectId),
    with: { org: true },
  });
  if (!project) return null;
  const [entry] = await tx
    .insert(timeEntries)
    .values({
      projectId: timer.projectId,
      taskId: timer.taskId,
      startedAt: timer.startedAt,
      endedAt,
      durationMin,
      note: timer.note,
      billable: isBillableByDefault(project, project.org),
      rateSnapshot: resolveRate(project, project.org),
    })
    .returning({ id: timeEntries.id });
  return entry.id;
}

export async function startTimer(projectId: number, taskId: number | null = null, note = "") {
  return run(async () => {
    await db.transaction(async (tx) => {
      await stopRunning(tx);
      await tx.insert(runningTimer).values({ id: 1, projectId, taskId, note, startedAt: new Date() });
      if (taskId) {
        // Starting work on a task moves it to "in progress" unless it's further along.
        await tx
          .update(tasks)
          .set({ status: "in_progress" })
          .where(and(eq(tasks.id, taskId), inArray(tasks.status, ["backlog", "todo"])));
      }
    });
    refreshAll();
  });
}

export async function stopTimer() {
  return run(async () => {
    const entryId = await db.transaction((tx) => stopRunning(tx));
    refreshAll();
    return entryId;
  });
}

export async function discardTimer() {
  return run(async () => {
    await db.delete(runningTimer);
    refreshAll();
  });
}

export async function updateTimerNote(note: string) {
  return run(async () => {
    await db.update(runningTimer).set({ note }).where(eq(runningTimer.id, 1));
  });
}

/** Restart the most recent entry's project/task. */
export async function resumeLast() {
  return run(async () => {
    const last = await db.query.timeEntries.findFirst({
      orderBy: (t, { desc }) => [desc(t.endedAt)],
    });
    if (!last) throw new ActionError("Nothing to resume");
    await db.transaction(async (tx) => {
      await stopRunning(tx);
      await tx.insert(runningTimer).values({
        id: 1,
        projectId: last.projectId,
        taskId: last.taskId,
        note: last.note,
        startedAt: new Date(),
      });
    });
    refreshAll();
  });
}

// ---------- Time entries ----------

/**
 * Reads date + either (start, end) times or a duration. Local time on the
 * server is used, which is fine while the app runs on the same machine.
 */
function entryTimes(fd: FormData) {
  const date = reqStr(fd, "date");
  const start = str(fd, "start");
  const end = str(fd, "end");
  const duration = str(fd, "duration");
  const durationMin = duration ? parseDuration(duration) : null;
  if (start && end) {
    const startedAt = new Date(`${date}T${start}`);
    let endedAt = new Date(`${date}T${end}`);
    if (endedAt <= startedAt) endedAt = new Date(endedAt.getTime() + 24 * 3600_000);
    const spanMin = Math.round((endedAt.getTime() - startedAt.getTime()) / 60000);
    // If the duration was edited so it no longer matches start/end, the duration wins.
    if (durationMin && durationMin > 0 && durationMin !== spanMin) {
      return { startedAt, endedAt: new Date(startedAt.getTime() + durationMin * 60000), durationMin };
    }
    return { startedAt, endedAt, durationMin: spanMin };
  }
  if (!durationMin || durationMin <= 0) throw new ActionError("Enter start/end or a duration");
  const startedAt = new Date(`${date}T${start ?? "09:00"}`);
  const endedAt = new Date(startedAt.getTime() + durationMin * 60000);
  return { startedAt, endedAt, durationMin };
}

/** "yes" | "no" → boolean; "auto" or missing → null (use project default). */
function billableFrom(fd: FormData): boolean | null {
  const v = str(fd, "billable");
  return v === "yes" ? true : v === "no" ? false : null;
}

export async function createTimeEntry(fd: FormData) {
  return run(async () => {
    const projectId = int(fd, "projectId");
    if (!projectId) throw new ActionError("Pick a project");
    const project = await projectWithOrg(projectId);
    const [e] = await db
      .insert(timeEntries)
      .values({
        projectId,
        taskId: int(fd, "taskId"),
        ...entryTimes(fd),
        note: str(fd, "note") ?? "",
        billable: billableFrom(fd) ?? isBillableByDefault(project, project.org),
        rateSnapshot: resolveRate(project, project.org),
      })
      .returning({ id: timeEntries.id });
    refreshAll();
    return e.id;
  });
}

export async function updateTimeEntry(id: number, fd: FormData) {
  return run(async () => {
    const projectId = int(fd, "projectId");
    if (!projectId) throw new ActionError("Pick a project");
    const existing = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
    if (!existing) throw new ActionError("Entry not found");
    // Keep the original rate unless the entry moved to another project.
    const project = await projectWithOrg(projectId);
    const rateSnapshot =
      existing.projectId === projectId ? existing.rateSnapshot : resolveRate(project, project.org);
    await db
      .update(timeEntries)
      .set({
        projectId,
        taskId: int(fd, "taskId"),
        ...entryTimes(fd),
        note: str(fd, "note") ?? "",
        billable: billableFrom(fd) ?? isBillableByDefault(project, project.org),
        rateSnapshot,
      })
      .where(eq(timeEntries.id, id));
    refreshAll();
  });
}

export async function deleteTimeEntry(id: number) {
  return run(async () => {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    refreshAll();
  });
}

// ---------- Payments ----------

export async function createPayment(fd: FormData) {
  return run(async () => {
    const projectId = int(fd, "projectId");
    if (!projectId) throw new ActionError("Missing project");
    const percent = int(fd, "percent");
    let amount = money(fd, "amount");
    if (amount == null && percent != null) {
      const project = await projectWithOrg(projectId);
      if (project.fixedPrice == null) throw new ActionError("Set a fixed price to use percentages");
      amount = Math.round((project.fixedPrice * percent) / 100);
    }
    if (amount == null) throw new ActionError("Enter an amount or a percentage");
    await db.insert(payments).values({
      projectId,
      label: reqStr(fd, "label"),
      percent,
      amount,
      dueDate: str(fd, "dueDate"),
      paidAt: str(fd, "paidAt"),
    });
    refreshAll();
  });
}

export async function setPaymentPaid(id: number, paidAt: string | null) {
  return run(async () => {
    await db.update(payments).set({ paidAt }).where(eq(payments.id, id));
    refreshAll();
  });
}

export async function deletePayment(id: number) {
  return run(async () => {
    await db.delete(payments).where(eq(payments.id, id));
    refreshAll();
  });
}
