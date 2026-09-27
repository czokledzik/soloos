import { format } from "date-fns";
import { entryValue } from "./billing";

type Entry = {
  startedAt: Date;
  durationMin: number;
  billable: boolean;
  rateSnapshot: number | null;
  currency: string;
  orgId: number;
  orgName: string;
  projectId: number;
  projectName: string;
  taskId: number | null;
  taskTitle: string | null;
  note: string;
};

export const GROUP_BY = [
  { value: "client", label: "Client" },
  { value: "project", label: "Project" },
  { value: "task", label: "Task" },
  { value: "day", label: "Day" },
] as const;
export type GroupBy = (typeof GROUP_BY)[number]["value"];

export type ReportGroup = {
  key: string;
  label: string;
  sub?: string;
  minutes: number;
  billableMin: number;
  value: Map<string, number>; // currency → minor units
};

export function groupEntries(entries: Entry[], by: GroupBy): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const e of entries) {
    const [key, label, sub] =
      by === "client"
        ? [`o${e.orgId}`, e.orgName]
        : by === "project"
          ? [`p${e.projectId}`, e.projectName, e.orgName]
          : by === "task"
            ? [`t${e.taskId ?? `p${e.projectId}`}`, e.taskTitle ?? "(no task)", `${e.orgName} · ${e.projectName}`]
            : [format(e.startedAt, "yyyy-MM-dd"), format(e.startedAt, "EEE, d MMM yyyy")];
    const g = groups.get(key) ?? { key, label, sub, minutes: 0, billableMin: 0, value: new Map() };
    g.minutes += e.durationMin;
    if (e.billable) g.billableMin += e.durationMin;
    const v = entryValue(e);
    if (v) g.value.set(e.currency, (g.value.get(e.currency) ?? 0) + v);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  return by === "day" ? list.sort((a, b) => a.key.localeCompare(b.key)) : list.sort((a, b) => b.minutes - a.minutes);
}

/**
 * Plain-text work summary (project → tasks with hours), for pasting into
 * Useme/Bizky descriptions or a client update.
 */
export function workSummary(entries: Entry[], periodLabel: string): string {
  const byProject = new Map<string, { org: string; total: number; tasks: Map<string, number> }>();
  for (const e of entries) {
    const key = `${e.orgName} — ${e.projectName}`;
    const p = byProject.get(key) ?? { org: e.orgName, total: 0, tasks: new Map() };
    p.total += e.durationMin;
    const t = e.taskTitle ?? (e.note || "Other work");
    p.tasks.set(t, (p.tasks.get(t) ?? 0) + e.durationMin);
    byProject.set(key, p);
  }
  const h = (m: number) => `${(m / 60).toFixed(1).replace(".", ",")} h`;
  const lines = [`Work summary ${periodLabel}`, ""];
  let total = 0;
  for (const [name, p] of byProject) {
    total += p.total;
    lines.push(`${name}: ${h(p.total)}`);
    for (const [t, m] of [...p.tasks].sort((a, b) => b[1] - a[1])) lines.push(`  - ${t} (${h(m)})`);
    lines.push("");
  }
  lines.push(`Total: ${h(total)}`);
  return lines.join("\n");
}
