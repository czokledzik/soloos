import { describe, expect, it } from "vitest";
import { scopeTotals } from "./scope";

describe("scopeTotals", () => {
  it("adds approved changes to price and budget, tracks pending separately", () => {
    const t = scopeTotals({ fixedPrice: 10_000_00, budgetHours: 40 }, [
      { status: "approved", hoursImpactMin: 300, priceImpact: 1_500_00 },
      { status: "approved", hoursImpactMin: -60, priceImpact: -300_00 },
      { status: "proposed", hoursImpactMin: 120, priceImpact: 600_00 },
      { status: "rejected", hoursImpactMin: 999, priceImpact: 99_999_00 },
    ]);
    expect(t).toEqual({
      approvedCount: 2,
      proposedCount: 1,
      approvedPrice: 1_200_00,
      approvedMin: 240,
      proposedPrice: 600_00,
      proposedMin: 120,
      currentPrice: 11_200_00,
      currentBudgetMin: 40 * 60 + 240,
    });
  });

  it("has no current price or budget when the project has none", () => {
    const t = scopeTotals({ fixedPrice: null, budgetHours: null }, []);
    expect([t.currentPrice, t.currentBudgetMin]).toEqual([null, null]);
  });
});
