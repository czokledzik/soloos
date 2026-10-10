import { notFound } from "next/navigation";
import { Stat } from "@/components/app/page-header";
import { ChangeRequests, DecisionLog, ScopeEditor } from "@/components/app/scope-panels";
import { formatHours, formatMoney } from "@/lib/format";
import { scopeTotals } from "@/lib/scope";
import { listChangeRequests, listDecisions } from "@/server/doc-queries";
import { getProject } from "@/server/queries";

export default async function ProjectScopePage({ params }: PageProps<"/projects/[id]/scope">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [project, crs, decisions] = await Promise.all([getProject(id), listChangeRequests(id), listDecisions(id)]);
  if (!project) notFound();
  const t = scopeTotals(project, crs);
  const sign = (n: number) => (n > 0 ? "+" : "");

  return (
    <div className="grid gap-6 px-6 pb-6">
      {(project.fixedPrice != null || project.budgetHours != null || crs.length > 0) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {t.currentPrice != null && (
            <Stat
              label="Price with approved changes"
              value={formatMoney(t.currentPrice, project.currency)}
              sub={`${formatMoney(project.fixedPrice, project.currency)} agreed ${sign(t.approvedPrice)}${formatMoney(t.approvedPrice, project.currency)}`}
            />
          )}
          {t.currentBudgetMin != null && (
            <Stat
              label="Budget with approved changes"
              value={formatHours(t.currentBudgetMin)}
              sub={`${formatHours(project.totalMin)} used`}
            />
          )}
          <Stat label="Approved changes" value={t.approvedCount} sub={`${sign(t.approvedMin)}${formatHours(t.approvedMin)}`} />
          <Stat
            label="Waiting for a decision"
            value={t.proposedCount}
            sub={
              t.proposedCount
                ? `${sign(t.proposedMin)}${formatHours(t.proposedMin)} · ${sign(t.proposedPrice)}${formatMoney(t.proposedPrice, project.currency)}`
                : undefined
            }
          />
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <ScopeEditor
            key={`${project.scopeMd.length}-${project.scopeBaselinedAt?.getTime()}`}
            projectId={id}
            scopeMd={project.scopeMd}
            baselinedAt={project.scopeBaselinedAt}
          />
          <ChangeRequests projectId={id} rows={crs} currency={project.currency} />
        </div>
        <DecisionLog projectId={id} rows={decisions} />
      </div>
    </div>
  );
}
