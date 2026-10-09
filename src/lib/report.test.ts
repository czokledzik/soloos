import { describe, expect, it } from "vitest";
import { groupEntries, workSummary } from "./report";

const base = {
  billable: true,
  rateSnapshot: 100_00,
  currency: "PLN",
  orgId: 1,
  orgName: "Acme",
  projectId: 10,
  projectName: "Website",
  taskId: null as number | null,
  taskTitle: null as string | null,
  note: "",
};
const entries = [
  { ...base, startedAt: new Date(2026, 9, 5, 9), durationMin: 60, taskId: 1, taskTitle: "Design" },
  { ...base, startedAt: new Date(2026, 9, 6, 9), durationMin: 30, taskId: 1, taskTitle: "Design" },
  { ...base, startedAt: new Date(2026, 9, 5, 14), durationMin: 120, billable: false, note: "Call" },
  { ...base, startedAt: new Date(2026, 9, 7, 9), durationMin: 45, orgId: 2, orgName: "Bakery", projectId: 20, projectName: "Shop", currency: "EUR", rateSnapshot: 50_00 },
];

describe("groupEntries", () => {
  it("groups by client, biggest first, value per currency", () => {
    const groups = groupEntries(entries, "client");
    expect(groups.map((g) => [g.label, g.minutes, g.billableMin, Object.fromEntries(g.value)])).toEqual([
      ["Acme", 210, 90, { PLN: 150_00 }],
      ["Bakery", 45, 45, { EUR: 37_50 }],
    ]);
  });

  it("groups by task, with untasked time per project", () => {
    const groups = groupEntries(entries, "task");
    expect(groups.map((g) => [g.label, g.minutes])).toEqual([
      ["(no task)", 120],
      ["Design", 90],
      ["(no task)", 45],
    ]);
  });

  it("groups by day in date order", () => {
    expect(groupEntries(entries, "day").map((g) => [g.key, g.minutes])).toEqual([
      ["2026-10-05", 180],
      ["2026-10-06", 30],
      ["2026-10-07", 45],
    ]);
  });
});

describe("workSummary", () => {
  it("lists projects with tasks and Polish decimal hours", () => {
    expect(workSummary(entries, "1–7 Oct")).toBe(
      [
        "Work summary 1–7 Oct",
        "",
        "Acme — Website: 3,5 h",
        "  - Call (2,0 h)",
        "  - Design (1,5 h)",
        "",
        "Bakery — Shop: 0,8 h",
        "  - Other work (0,8 h)",
        "",
        "Total: 4,3 h",
      ].join("\n"),
    );
  });
});
