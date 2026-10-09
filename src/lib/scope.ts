type CR = { status: "proposed" | "approved" | "rejected"; hoursImpactMin: number | null; priceImpact: number | null };

/** Agreed price/hours plus approved changes, and what's still pending. */
export function scopeTotals(project: { fixedPrice: number | null; budgetHours: number | null }, crs: CR[]) {
  const sum = (list: CR[], key: "hoursImpactMin" | "priceImpact") => list.reduce((s, c) => s + (c[key] ?? 0), 0);
  const approved = crs.filter((c) => c.status === "approved");
  const proposed = crs.filter((c) => c.status === "proposed");
  const baseMin = project.budgetHours != null ? project.budgetHours * 60 : null;
  return {
    approvedCount: approved.length,
    proposedCount: proposed.length,
    approvedPrice: sum(approved, "priceImpact"),
    approvedMin: sum(approved, "hoursImpactMin"),
    proposedPrice: sum(proposed, "priceImpact"),
    proposedMin: sum(proposed, "hoursImpactMin"),
    /** Fixed price including approved changes (null without a fixed price). */
    currentPrice: project.fixedPrice != null ? project.fixedPrice + sum(approved, "priceImpact") : null,
    /** Budget in minutes including approved changes (null without a budget). */
    currentBudgetMin: baseMin != null ? baseMin + sum(approved, "hoursImpactMin") : null,
  };
}
