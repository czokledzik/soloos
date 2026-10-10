import { beforeEach, describe, expect, it } from "vitest";
import { db, payments, timeEntries } from "@/db";
import { readReportParams } from "@/lib/report-params";
import { getFixedPriceProjects, getReportEntries, getUnpaidPayments } from "@/server/report-queries";
import { makeOrg, makeProject, resetDb } from "../db";

beforeEach(resetDb);

const at = (s: string) => new Date(s);

describe("report queries", () => {
  it("filters by local period boundaries, client and billable", async () => {
    const a = await makeOrg({ name: "A" });
    const b = await makeOrg({ name: "B" });
    const pa = await makeProject({ orgId: a.id, name: "PA" });
    const pb = await makeProject({ orgId: b.id, name: "PB" });
    await db.insert(timeEntries).values([
      // 30 Sep 23:30 Warsaw time is still September.
      { projectId: pa.id, startedAt: at("2026-09-30T21:30:00Z"), endedAt: at("2026-09-30T22:00:00Z"), durationMin: 30 },
      // 1 Oct 00:30 Warsaw time is October (22:30 UTC the day before).
      { projectId: pa.id, startedAt: at("2026-09-30T22:30:00Z"), endedAt: at("2026-09-30T23:00:00Z"), durationMin: 30 },
      { projectId: pb.id, startedAt: at("2026-10-05T08:00:00Z"), endedAt: at("2026-10-05T09:00:00Z"), durationMin: 60, billable: false },
    ]);
    const { filters } = readReportParams({ period: "custom", from: "2026-10-01", to: "2026-10-31" });
    expect((await getReportEntries(filters)).map((e) => [e.projectName, e.durationMin])).toEqual([
      ["PA", 30],
      ["PB", 60],
    ]);
    expect((await getReportEntries({ ...filters, orgId: b.id })).map((e) => e.projectName)).toEqual(["PB"]);
    expect((await getReportEntries({ ...filters, billable: true })).map((e) => e.projectName)).toEqual(["PA"]);
  });

  it("lists fixed-price projects with all-time minutes, and unpaid payments soonest first", async () => {
    const p = await makeProject({ name: "Fixed", pricing: "fixed", fixedPrice: 5000_00 });
    await makeProject({ name: "Hourly", orgId: p.orgId });
    await db.insert(timeEntries).values([
      { projectId: p.id, startedAt: at("2025-01-01T10:00:00Z"), endedAt: at("2025-01-01T11:00:00Z"), durationMin: 60 },
      { projectId: p.id, startedAt: at("2026-10-01T10:00:00Z"), endedAt: at("2026-10-01T10:30:00Z"), durationMin: 30 },
    ]);
    await db.insert(payments).values([
      { projectId: p.id, label: "Later", amount: 100, dueDate: "2026-12-01" },
      { projectId: p.id, label: "Paid", amount: 100, dueDate: "2026-10-01", paidAt: "2026-10-02" },
      { projectId: p.id, label: "Soon", amount: 100, dueDate: "2026-10-15" },
    ]);
    expect((await getFixedPriceProjects()).map((r) => [r.name, r.totalMin])).toEqual([["Fixed", 90]]);
    expect((await getUnpaidPayments()).map((r) => r.label)).toEqual(["Soon", "Later"]);
  });
});
