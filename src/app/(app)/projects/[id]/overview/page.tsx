import { notFound } from "next/navigation";
import { NotesEditor } from "@/components/app/notes-editor";
import { Stat } from "@/components/app/page-header";
import { effectiveRate } from "@/lib/billing";
import { formatHours, formatMoney } from "@/lib/format";
import { updateProjectNotes } from "@/server/actions";
import { getProject, listPayments } from "@/server/queries";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]/overview">) {
  const id = Number((await params).id);
  const [project, payments] = await Promise.all([getProject(id), listPayments(id)]);
  if (!project) notFound();
  const paid = payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const budgetPct = project.budgetHours ? Math.round((project.totalMin / 60 / project.budgetHours) * 100) : null;
  const saveNotes = updateProjectNotes.bind(null, id);

  return (
    <div className="grid gap-6 px-6 pb-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Tracked"
          value={formatHours(project.totalMin)}
          sub={`${formatHours(project.billableMin)} billable`}
        />
        {project.budgetHours != null && (
          <Stat label="Budget used" value={`${budgetPct}%`} sub={`of ${project.budgetHours}h`} />
        )}
        {project.pricing === "hourly" && (
          <Stat label="Billable value" value={formatMoney(project.value, project.currency)} />
        )}
        {project.pricing === "fixed" && (
          <>
            <Stat label="Fixed price" value={formatMoney(project.fixedPrice, project.currency)} />
            <Stat
              label="Effective rate"
              value={`${formatMoney(effectiveRate(project.fixedPrice, project.totalMin), project.currency)}/h`}
              sub="price ÷ hours tracked"
            />
          </>
        )}
        {payments.length > 0 && <Stat label="Paid" value={formatMoney(paid, project.currency)} />}
      </div>
      <section className="max-w-3xl">
        <h2 className="mb-2 text-sm font-medium">Notes</h2>
        <NotesEditor initial={project.notesMd} save={saveNotes} />
      </section>
    </div>
  );
}
