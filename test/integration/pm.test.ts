import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, organizations, payments, projects, tasks, timeEntries } from "@/db";
import {
  createPayment,
  createProject,
  createTask,
  createTimeEntry,
  deleteTask,
  moveTask,
  setPaymentPaid,
  updateTask,
  updateTimeEntry,
} from "@/server/actions";
import { getProject, listOpenTasks, listProjects } from "@/server/queries";
import { form, makeOrg, makeProject, makeTask, ok, resetDb } from "../db";

beforeEach(resetDb);

describe("projects", () => {
  it("creates a project for a new client in one step", async () => {
    const id = ok(
      await createProject(form({ newOrgName: "Bakery", name: "Shop", pricing: "fixed", fixedPrice: "4 500,00" })),
    );
    const p = await db.query.projects.findFirst({ where: eq(projects.id, id), with: { org: true } });
    expect(p).toMatchObject({ name: "Shop", pricing: "fixed", fixedPrice: 450_000, org: { name: "Bakery", status: "active" } });
  });

  it("requires a client and a name", async () => {
    expect(await createProject(form({ name: "X" }))).toEqual({ ok: false, error: "Pick a client or enter a new client name" });
    const org = await makeOrg();
    expect(await createProject(form({ orgId: org.id }))).toEqual({ ok: false, error: "name is required" });
  });

  it("lists projects with this month's minutes and task counts", async () => {
    const p = await makeProject();
    await makeTask({ projectId: p.id });
    await makeTask({ projectId: p.id, status: "done" });
    const now = new Date();
    const lastYear = new Date(now.getFullYear() - 1, 0, 15, 10);
    await db.insert(timeEntries).values([
      { projectId: p.id, startedAt: now, endedAt: now, durationMin: 30 },
      { projectId: p.id, startedAt: lastYear, endedAt: lastYear, durationMin: 60 },
    ]);
    const [row] = await listProjects();
    expect(row).toMatchObject({ totalMin: 90, monthMin: 30, openTasks: 1, doneTasks: 1 });
  });

  it("totals project value from billable entries only", async () => {
    const p = await makeProject();
    const t = new Date();
    await db.insert(timeEntries).values([
      { projectId: p.id, startedAt: t, endedAt: t, durationMin: 90, billable: true, rateSnapshot: 100_00 },
      { projectId: p.id, startedAt: t, endedAt: t, durationMin: 60, billable: false, rateSnapshot: 100_00 },
    ]);
    expect(await getProject(p.id)).toMatchObject({ totalMin: 150, billableMin: 90, value: 150_00 });
  });
});

describe("tasks", () => {
  it("appends new tasks to the end of their column", async () => {
    const p = await makeProject();
    const a = ok(await createTask(form({ projectId: p.id, title: "A" })));
    const b = ok(await createTask(form({ projectId: p.id, title: "B", estimate: "1h 30m" })));
    const rows = await db.select().from(tasks).orderBy(asc(tasks.sortOrder));
    expect(rows.map((r) => r.id)).toEqual([a, b]);
    expect(rows[1].estimateMin).toBe(90);
  });

  it("sets and clears completedAt as tasks move in and out of done", async () => {
    const t = await makeTask();
    ok(await updateTask(t.id, { status: "done" }));
    expect((await db.query.tasks.findFirst({ where: eq(tasks.id, t.id) }))!.completedAt).toBeInstanceOf(Date);
    ok(await updateTask(t.id, { status: "todo" }));
    expect((await db.query.tasks.findFirst({ where: eq(tasks.id, t.id) }))!.completedAt).toBeNull();
  });

  it("keeps the original completion time when a done task is edited", async () => {
    const t = await makeTask();
    ok(await updateTask(t.id, { status: "done" }));
    const first = (await db.query.tasks.findFirst({ where: eq(tasks.id, t.id) }))!.completedAt!;
    await new Promise((r) => setTimeout(r, 20));
    ok(await updateTask(t.id, { status: "done", title: "Renamed" }));
    const again = (await db.query.tasks.findFirst({ where: eq(tasks.id, t.id) }))!.completedAt!;
    expect(again.getTime()).toBe(first.getTime());
  });

  it("rejects blank titles and unknown statuses", async () => {
    const t = await makeTask();
    expect(await updateTask(t.id, { title: "  " })).toEqual({ ok: false, error: "Title is required" });
    expect(await updateTask(t.id, { status: "nope" as never })).toEqual({ ok: false, error: "Bad status" });
  });

  it("moving on the board persists status and order", async () => {
    const p = await makeProject();
    const a = await makeTask({ projectId: p.id, title: "A", status: "todo" });
    const b = await makeTask({ projectId: p.id, title: "B", status: "done" });
    ok(await moveTask(a.id, "done", [a.id, b.id]));
    const rows = await db.select().from(tasks).orderBy(asc(tasks.sortOrder));
    expect(rows.map((r) => [r.title, r.status])).toEqual([
      ["A", "done"],
      ["B", "done"],
    ]);
    expect(rows[0].completedAt).toBeInstanceOf(Date);
  });

  it("open tasks exclude done tasks and archived projects", async () => {
    const live = await makeProject({ name: "Live" });
    const archived = await makeProject({ name: "Old", orgId: live.orgId, status: "archived" });
    await makeTask({ projectId: live.id, title: "open" });
    await makeTask({ projectId: live.id, title: "closed", status: "done" });
    await makeTask({ projectId: archived.id, title: "hidden" });
    expect((await listOpenTasks()).map((t) => t.title)).toEqual(["open"]);
  });

  it("deleting a task keeps its tracked time on the project", async () => {
    const t = await makeTask();
    const now = new Date();
    await db.insert(timeEntries).values({ projectId: t.projectId, taskId: t.id, startedAt: now, endedAt: now, durationMin: 25 });
    ok(await deleteTask(t.id));
    const [entry] = await db.select().from(timeEntries);
    expect(entry).toMatchObject({ projectId: t.projectId, taskId: null, durationMin: 25 });
  });
});

describe("time entries", () => {
  it("creates from start and end times in local time", async () => {
    const p = await makeProject({ hourlyRate: 100_00 });
    const id = ok(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", start: "09:15", end: "11:00" })));
    const e = (await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!;
    expect(e.startedAt).toEqual(new Date(2026, 9, 5, 9, 15));
    expect(e).toMatchObject({ durationMin: 105, rateSnapshot: 100_00, billable: true });
  });

  it("wraps past midnight when end is before start", async () => {
    const p = await makeProject();
    const id = ok(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", start: "23:30", end: "00:30" })));
    const e = (await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!;
    expect(e.durationMin).toBe(60);
    expect(e.endedAt).toEqual(new Date(2026, 9, 6, 0, 30));
  });

  it("an edited duration wins over start/end", async () => {
    const p = await makeProject();
    const id = ok(
      await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", start: "09:00", end: "10:00", duration: "1:30" })),
    );
    const e = (await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!;
    expect(e.durationMin).toBe(90);
    expect(e.endedAt).toEqual(new Date(2026, 9, 5, 10, 30));
  });

  it("duration only starts at 09:00", async () => {
    const p = await makeProject();
    const id = ok(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", duration: "2h" })));
    const e = (await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!;
    expect(e.startedAt).toEqual(new Date(2026, 9, 5, 9, 0));
    expect(e.durationMin).toBe(120);
  });

  it("rejects entries without times", async () => {
    const p = await makeProject();
    expect(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05" }))).toEqual({
      ok: false,
      error: "Enter start/end or a duration",
    });
    expect(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", duration: "0" }))).toMatchObject({ ok: false });
  });

  it("billable override beats the project default", async () => {
    const p = await makeProject();
    const id = ok(await createTimeEntry(form({ projectId: p.id, date: "2026-10-05", duration: "1", billable: "no" })));
    expect((await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!.billable).toBe(false);
  });

  it("keeps the snapshotted rate on edit, re-resolves when moved to another project", async () => {
    const a = await makeProject({ name: "A", hourlyRate: 100_00 });
    const b = await makeProject({ name: "B", orgId: a.orgId, hourlyRate: 200_00 });
    const id = ok(await createTimeEntry(form({ projectId: a.id, date: "2026-10-05", duration: "1" })));
    await db.update(projects).set({ hourlyRate: 150_00 }).where(eq(projects.id, a.id));

    ok(await updateTimeEntry(id, form({ projectId: a.id, date: "2026-10-05", duration: "2" })));
    expect((await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!.rateSnapshot).toBe(100_00);

    ok(await updateTimeEntry(id, form({ projectId: b.id, date: "2026-10-05", duration: "2" })));
    expect((await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) }))!.rateSnapshot).toBe(200_00);
  });
});

describe("payments", () => {
  it("computes amounts from a percentage of the fixed price", async () => {
    const p = await makeProject({ pricing: "fixed", fixedPrice: 10_000_00 });
    ok(await createPayment(form({ projectId: p.id, label: "Upfront", percent: 40 })));
    const [pay] = await db.select().from(payments);
    expect(pay).toMatchObject({ label: "Upfront", percent: 40, amount: 4_000_00, paidAt: null });

    ok(await setPaymentPaid(pay.id, "2026-10-01"));
    expect((await db.select().from(payments))[0].paidAt).toBe("2026-10-01");
  });

  it("needs a fixed price for percentages", async () => {
    const p = await makeProject({ pricing: "hourly" });
    expect(await createPayment(form({ projectId: p.id, label: "X", percent: 50 }))).toEqual({
      ok: false,
      error: "Set a fixed price to use percentages",
    });
  });

  it("an explicit amount wins over the percentage", async () => {
    const p = await makeProject({ pricing: "fixed", fixedPrice: 10_000_00 });
    ok(await createPayment(form({ projectId: p.id, label: "X", percent: 50, amount: "1000" })));
    expect((await db.select().from(payments))[0].amount).toBe(1000_00);
  });
});

describe("organizations", () => {
  it("is cleaned between tests", async () => {
    expect(await db.select().from(organizations)).toEqual([]);
  });
});
