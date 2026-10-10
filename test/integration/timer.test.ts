import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, runningTimer, tasks, timeEntries } from "@/db";
import { discardTimer, resumeLast, startTimer, stopTimer } from "@/server/actions";
import { makeOrg, makeProject, makeTask, ok, resetDb } from "../db";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

/** Pretend the running timer was started `m` minutes ago. */
async function backdateTimer(m: number) {
  await db.update(runningTimer).set({ startedAt: minutesAgo(m) });
}

beforeEach(resetDb);

describe("timer", () => {
  it("stopping writes a time entry with the project's rate", async () => {
    const project = await makeProject({ hourlyRate: 120_00 });
    ok(await startTimer(project.id, null, "Planning"));
    await backdateTimer(30);

    const entryId = ok(await stopTimer());
    const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, entryId!) });
    expect(entry).toMatchObject({ projectId: project.id, durationMin: 30, note: "Planning", billable: true, rateSnapshot: 120_00 });
    expect(await db.select().from(runningTimer)).toEqual([]);
  });

  it("discards entries under a minute", async () => {
    const project = await makeProject();
    ok(await startTimer(project.id));
    expect(ok(await stopTimer())).toBeNull();
    expect(await db.select().from(timeEntries)).toEqual([]);
    expect(await db.select().from(runningTimer)).toEqual([]);
  });

  it("only one timer runs: starting another stops the current one", async () => {
    const a = await makeProject({ name: "A" });
    const b = await makeProject({ name: "B", orgId: a.orgId });
    ok(await startTimer(a.id));
    await backdateTimer(15);
    ok(await startTimer(b.id));

    const entries = await db.select().from(timeEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ projectId: a.id, durationMin: 15 });
    const timers = await db.select().from(runningTimer);
    expect(timers).toHaveLength(1);
    expect(timers[0].projectId).toBe(b.id);
  });

  it("starting on a task moves it to in progress, but not backwards", async () => {
    const todo = await makeTask({ status: "todo" });
    const review = await makeTask({ status: "review", projectId: todo.projectId });
    ok(await startTimer(todo.projectId, todo.id));
    ok(await startTimer(review.projectId, review.id));
    const rows = await db.select({ id: tasks.id, status: tasks.status }).from(tasks).orderBy(tasks.id);
    expect(rows).toEqual([
      { id: todo.id, status: "in_progress" },
      { id: review.id, status: "review" },
    ]);
  });

  it("time on internal clients and unpriced projects isn't billable", async () => {
    const personal = await makeOrg({ name: "Personal", status: "internal" });
    const project = await makeProject({ orgId: personal.id, pricing: "hourly", hourlyRate: 100_00 });
    ok(await startTimer(project.id));
    await backdateTimer(10);
    ok(await stopTimer());
    const [entry] = await db.select().from(timeEntries);
    expect(entry.billable).toBe(false);
  });

  it("falls back to the client's default rate", async () => {
    const org = await makeOrg({ defaultRate: 90_00 });
    const project = await makeProject({ orgId: org.id, hourlyRate: null });
    ok(await startTimer(project.id));
    await backdateTimer(60);
    ok(await stopTimer());
    const [entry] = await db.select().from(timeEntries);
    expect(entry.rateSnapshot).toBe(90_00);
  });

  it("discard drops the timer without an entry", async () => {
    const project = await makeProject();
    ok(await startTimer(project.id));
    await backdateTimer(45);
    ok(await discardTimer());
    expect(await db.select().from(timeEntries)).toEqual([]);
    expect(await db.select().from(runningTimer)).toEqual([]);
  });

  it("resume restarts the most recent entry's project and task", async () => {
    const task = await makeTask();
    ok(await startTimer(task.projectId, task.id, "First"));
    await backdateTimer(20);
    ok(await stopTimer());

    ok(await resumeLast());
    const [timer] = await db.select().from(runningTimer);
    expect(timer).toMatchObject({ projectId: task.projectId, taskId: task.id, note: "First" });
  });

  it("resume with no history is a friendly error", async () => {
    expect(await resumeLast()).toEqual({ ok: false, error: "Nothing to resume" });
  });

  it("concurrent starts leave exactly one timer", async () => {
    const project = await makeProject();
    const results = await Promise.all([startTimer(project.id), startTimer(project.id), startTimer(project.id)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await db.select().from(runningTimer)).toHaveLength(1);
  });
});
