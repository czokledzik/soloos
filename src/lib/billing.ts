import type { Organization, Project } from "@/db/schema";

/** Hourly rate (minor units) that applies to new time on this project, or null. */
export function resolveRate(
  project: Pick<Project, "pricing" | "hourlyRate">,
  org: Pick<Organization, "defaultRate">,
): number | null {
  if (project.pricing !== "hourly") return null;
  return project.hourlyRate ?? org.defaultRate ?? null;
}

export function isBillableByDefault(
  project: Pick<Project, "pricing">,
  org: Pick<Organization, "status">,
): boolean {
  return project.pricing !== "none" && org.status !== "internal";
}

/** Value of billable time in minor units. */
export function entryValue(e: { durationMin: number; billable: boolean; rateSnapshot: number | null }) {
  if (!e.billable || e.rateSnapshot == null) return 0;
  return Math.round((e.durationMin / 60) * e.rateSnapshot);
}

/** Effective hourly rate (minor units) for a fixed-price project. */
export function effectiveRate(fixedPrice: number | null, minutes: number): number | null {
  if (fixedPrice == null || minutes <= 0) return null;
  return Math.round(fixedPrice / (minutes / 60));
}
