import { describe, expect, it } from "vitest";
import { parsePeriod } from "./period";

// Tests run with TZ=Europe/Warsaw (see vitest.config.ts).
const now = new Date(2026, 9, 9, 15, 30); // Fri 9 Oct 2026, 15:30 local
const local = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const range = (p: { from: Date; to: Date }) => [local(p.from), local(p.to)];

describe("parsePeriod", () => {
  it("defaults to this month, half-open", () => {
    const p = parsePeriod({}, now);
    expect(p.key).toBe("this-month");
    expect(range(p)).toEqual(["2026-10-01 00:00", "2026-11-01 00:00"]);
  });

  it("weeks start on Monday", () => {
    expect(range(parsePeriod({ period: "this-week" }, now))).toEqual(["2026-10-05 00:00", "2026-10-12 00:00"]);
    expect(range(parsePeriod({ period: "last-week" }, now))).toEqual(["2026-09-28 00:00", "2026-10-05 00:00"]);
  });

  it("handles last month and this year", () => {
    expect(range(parsePeriod({ period: "last-month" }, now))).toEqual(["2026-09-01 00:00", "2026-10-01 00:00"]);
    expect(range(parsePeriod({ period: "this-year" }, now))).toEqual(["2026-01-01 00:00", "2027-01-01 00:00"]);
  });

  it("includes the whole 'to' day of a custom range", () => {
    const p = parsePeriod({ period: "custom", from: "2026-09-10", to: "2026-09-20" }, now);
    expect(range(p)).toEqual(["2026-09-10 00:00", "2026-09-21 00:00"]);
    expect(p.label).toBe("10 Sep – 20 Sep 2026");
  });

  it("spans a DST change without drifting off midnight", () => {
    // Clocks go back on 25 Oct 2026 in Warsaw.
    const p = parsePeriod({ period: "this-week" }, new Date(2026, 9, 25, 12));
    expect(range(p)).toEqual(["2026-10-19 00:00", "2026-10-26 00:00"]);
  });

  it("falls back to this month for unknown keys", () => {
    expect(parsePeriod({ period: "nonsense" }, now).key).toBe("this-month");
  });
});
