import { describe, expect, it } from "vitest";
import { effectiveRate, entryValue, isBillableByDefault, resolveRate } from "./billing";

describe("resolveRate", () => {
  it("prefers the project rate, then the client default", () => {
    expect(resolveRate({ pricing: "hourly", hourlyRate: 200_00 }, { defaultRate: 100_00 })).toBe(200_00);
    expect(resolveRate({ pricing: "hourly", hourlyRate: null }, { defaultRate: 100_00 })).toBe(100_00);
    expect(resolveRate({ pricing: "hourly", hourlyRate: null }, { defaultRate: null })).toBeNull();
  });

  it("has no rate for fixed-price or unpriced projects", () => {
    expect(resolveRate({ pricing: "fixed", hourlyRate: 200_00 }, { defaultRate: 100_00 })).toBeNull();
    expect(resolveRate({ pricing: "none", hourlyRate: 200_00 }, { defaultRate: 100_00 })).toBeNull();
  });
});

describe("isBillableByDefault", () => {
  it("is false for internal clients and unpriced projects", () => {
    expect(isBillableByDefault({ pricing: "hourly" }, { status: "active" })).toBe(true);
    expect(isBillableByDefault({ pricing: "fixed" }, { status: "active" })).toBe(true);
    expect(isBillableByDefault({ pricing: "none" }, { status: "active" })).toBe(false);
    expect(isBillableByDefault({ pricing: "hourly" }, { status: "internal" })).toBe(false);
  });
});

describe("entryValue", () => {
  it("is hours × rate for billable entries", () => {
    expect(entryValue({ durationMin: 90, billable: true, rateSnapshot: 100_00 })).toBe(150_00);
    expect(entryValue({ durationMin: 1, billable: true, rateSnapshot: 100_00 })).toBe(167);
  });

  it("is zero without a rate or when not billable", () => {
    expect(entryValue({ durationMin: 90, billable: false, rateSnapshot: 100_00 })).toBe(0);
    expect(entryValue({ durationMin: 90, billable: true, rateSnapshot: null })).toBe(0);
  });
});

describe("effectiveRate", () => {
  it("divides the fixed price by hours worked", () => {
    expect(effectiveRate(3000_00, 1200)).toBe(150_00);
    expect(effectiveRate(null, 60)).toBeNull();
    expect(effectiveRate(3000_00, 0)).toBeNull();
  });
});
