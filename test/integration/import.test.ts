import { beforeEach, describe, expect, it } from "vitest";
import { db, organizations, projects, tasks, timeEntries } from "@/db";
import { importClockify, importLinear } from "@/server/import-actions";
import { makeOrg, ok, resetDb } from "../db";

beforeEach(resetDb);

const clockify = [
  "Project,Client,Description,Task,Billable,Start Date,Start Time,End Date,End Time,Billable Rate (PLN)",
  "Website,Acme,Hero,Design,Yes,27/09/2026,09:00:00,27/09/2026,10:30:00,150",
  "Website,Acme,Footer,Design,Yes,27/09/2026,11:00:00,27/09/2026,11:30:00,150",
  "Blog,,Writing,,No,28/09/2026,20:00:00,28/09/2026,21:00:00,0",
].join("\n");

function upload(text: string, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("file", new File([text], "export.csv", { type: "text/csv" }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

describe("Clockify import", () => {
  it("dry run previews without writing", async () => {
    const summary = ok(await importClockify(upload(clockify, { dryRun: "1" })));
    expect(summary).toMatchObject({
      dryRun: true,
      rows: 3,
      imported: 3,
      duplicates: 0,
      newClients: ["Acme", "Personal"],
      newProjects: ["Acme · Website", "Personal · Blog"],
      newTasks: 1,
      from: "2026-09-27",
      to: "2026-09-28",
      hours: 3,
    });
    expect(await db.select().from(timeEntries)).toEqual([]);
    expect(await db.select().from(organizations)).toEqual([]);
  });

  it("imports, matching existing clients by name, and skips duplicates on re-import", async () => {
    await makeOrg({ name: "ACME" });
    const first = ok(await importClockify(upload(clockify)));
    expect(first).toMatchObject({ imported: 3, newClients: ["Personal"] });

    const entries = await db.select().from(timeEntries).orderBy(timeEntries.startedAt);
    expect(entries.map((e) => [e.durationMin, e.billable, e.rateSnapshot])).toEqual([
      [90, true, 150_00],
      [30, true, 150_00],
      [60, false, null],
    ]);
    expect(entries[0].taskId).toBe(entries[1].taskId);
    const [blog] = (await db.select().from(projects)).filter((p) => p.name === "Blog");
    expect(blog.pricing).toBe("none");

    const again = ok(await importClockify(upload(clockify)));
    expect(again).toMatchObject({ imported: 0, duplicates: 3 });
    expect(await db.select().from(timeEntries)).toHaveLength(3);
  });

  it("requires a file", async () => {
    expect(await importClockify(new FormData())).toEqual({ ok: false, error: "Choose a CSV file" });
  });
});

describe("Linear import", () => {
  const linear = [
    "ID,Team,Title,Description,Status,Priority,Project,Created,Completed,Canceled,Due Date",
    "ENG-1,Eng,Ship,Body,In Progress,High,Launch,2026-09-01T10:00:00.000Z,,,2026-10-20",
    "ENG-2,Eng,Done thing,,Done,Low,Launch,2026-09-01T10:00:00.000Z,2026-09-05T10:00:00.000Z,,",
    "ENG-3,Eng,Dropped,,Canceled,,Launch,,,2026-09-03T10:00:00.000Z,",
  ].join("\n");

  it("imports issues as tasks under the chosen client, skipping canceled", async () => {
    const org = await makeOrg({ name: "Acme" });
    const summary = ok(await importLinear(upload(linear, { orgId: String(org.id) })));
    expect(summary).toMatchObject({ imported: 2, skipped: 1, newProjects: ["Acme · Launch"] });
    const rows = await db.select().from(tasks).orderBy(tasks.sortOrder);
    expect(rows.map((t) => [t.title, t.status, t.priority, t.dueDate])).toEqual([
      ["Ship", "in_progress", 3, "2026-10-20"],
      ["Done thing", "done", 1, null],
    ]);
    expect(rows[1].completedAt).toEqual(new Date("2026-09-05T10:00:00.000Z"));

    const again = ok(await importLinear(upload(linear, { orgId: String(org.id), includeCanceled: "on" })));
    expect(again).toMatchObject({ imported: 1, duplicates: 2 });
  });

  it("needs a client", async () => {
    expect(await importLinear(upload(linear))).toEqual({ ok: false, error: "Pick the client these issues belong to" });
  });
});
