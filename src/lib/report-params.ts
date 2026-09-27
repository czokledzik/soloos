import type { GroupBy } from "./report";
import { parsePeriod } from "./period";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Normalizes /reports search params; shared by the page and the CSV route. */
export function readReportParams(sp: Params) {
  const period = parsePeriod(sp);
  const orgId = Number(one(sp.client)) || undefined;
  const projectId = Number(one(sp.project)) || undefined;
  const billable = one(sp.billable) === "yes" ? true : one(sp.billable) === "no" ? false : undefined;
  const g = one(sp.group);
  const group: GroupBy = g === "project" || g === "task" || g === "day" ? g : "client";
  return {
    period,
    filters: { from: period.from, to: period.to, orgId, projectId, billable },
    group,
    raw: {
      period: period.key,
      from: one(sp.from),
      to: one(sp.to),
      client: orgId ? String(orgId) : "",
      project: projectId ? String(projectId) : "",
      billable: one(sp.billable),
      group,
    },
  };
}
