import Link from "next/link";
import { OpenDialogButton } from "@/components/app/buttons";
import { Empty, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatHours, formatMoney } from "@/lib/format";
import { PROJECT_STATUSES, labelOf } from "@/lib/labels";
import { listProjects, type ProjectRow } from "@/server/queries";

export const metadata = { title: "Projects" };

const GROUPS = [
  { title: "Active", statuses: ["active"] },
  { title: "Planned & paused", statuses: ["planned", "paused"] },
  { title: "Done", statuses: ["done"] },
];

export default async function ProjectsPage() {
  const rows = await listProjects();
  return (
    <div>
      <PageHeader title="Projects" actions={<OpenDialogButton kind="project">New project</OpenDialogButton>} />
      <div className="grid gap-6 px-6 pb-6">
        {rows.length === 0 && <Empty>No projects yet. Create one to start tracking tasks and time.</Empty>}
        {GROUPS.map((g) => {
          const list = rows.filter((r) => g.statuses.includes(r.project.status));
          if (!list.length) return null;
          return (
            <section key={g.title}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{g.title}</h2>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                      <th className="px-3 py-2 font-medium">Pricing</th>
                      <th className="px-3 py-2 text-right font-medium">Tasks</th>
                      <th className="px-3 py-2 text-right font-medium">This month</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {list.map((r) => (
                      <Row key={r.project.id} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Row({ row: { project: p, org, totalMin, monthMin, openTasks, doneTasks } }: { row: ProjectRow }) {
  const budgetPct = p.budgetHours ? Math.round((totalMin / 60 / p.budgetHours) * 100) : null;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-3 py-2">
        <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
          {p.name}
        </Link>
        {p.status !== "active" && (
          <Badge variant="secondary" className="ml-2">
            {labelOf(PROJECT_STATUSES, p.status)}
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{org.name}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {p.pricing === "hourly" && `${formatMoney(p.hourlyRate ?? org.defaultRate, p.currency)}/h`}
        {p.pricing === "fixed" && formatMoney(p.fixedPrice, p.currency)}
        {p.pricing === "none" && "—"}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {openTasks} open{doneTasks ? ` · ${doneTasks} done` : ""}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(monthMin)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatHours(totalMin)}
        {budgetPct != null && (
          <span className={budgetPct > 100 ? "ml-1 text-red-500" : "ml-1 text-muted-foreground"}>
            ({budgetPct}%)
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground">{p.dueDate ? formatDate(p.dueDate, "d MMM") : ""}</td>
    </tr>
  );
}
