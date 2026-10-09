import { notFound } from "next/navigation";
import { NotesEditor } from "@/components/app/notes-editor";
import { Stat } from "@/components/app/page-header";
import { effectiveRate } from "@/lib/billing";
import { formatHours, formatMoney } from "@/lib/format";
import { updateProjectNotes } from "@/server/actions";
import { updateProjectBrief } from "@/server/doc-actions";
import { OpenDialogButton } from "@/components/app/buttons";
import { Timeline } from "@/components/app/timeline";
import { getCrmPickers, listInteractions } from "@/server/crm-queries";
import { listThreads } from "@/server/message-queries";
import { BriefAiPanel } from "@/components/app/ai-panel";
import { aiProvider, jobView } from "@/server/ai/run";
import { getPickerData, getProject, listPayments } from "@/server/queries";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

export default async function ProjectOverviewPage({ params }: PageProps<"/projects/[id]/overview">) {
  const id = Number((await params).id);
  const [project, payments, interactions, threads, crm, pickers, briefJob] = await Promise.all([
    getProject(id),
    listPayments(id),
    listInteractions({ projectId: id }),
    listThreads({ projectId: id }),
    getCrmPickers(),
    getPickerData(),
    jobView("project_brief", id),
  ]);
  if (!project) notFound();
  const paid = payments.filter((p) => p.paidAt).reduce((s, p) => s + p.amount, 0);
  const budgetPct = project.budgetHours ? Math.round((project.totalMin / 60 / project.budgetHours) * 100) : null;
  const saveNotes = updateProjectNotes.bind(null, id);
  const saveBrief = updateProjectBrief.bind(null, id);

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
      <section>
        <h2 className="mb-2 text-sm font-medium">Brief</h2>
        <NotesEditor
          initial={project.briefMd}
          save={saveBrief}
          placeholder="What is this project, for whom, what does done look like? Keep it short: it's the first thing anyone (or an AI) reads."
          className="min-h-24"
        />
        <div className="mt-2">
          <BriefAiPanel projectId={id} job={briefJob} enabled={aiProvider() !== "off"} />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium">Notes</h2>
          <NotesEditor initial={project.notesMd} save={saveNotes} />
        </section>
        <section className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Conversations</h2>
            <div className="flex gap-1">
              <Link
                href={`/messages/new?org=${project.orgId}&project=${id}`}
                className={buttonVariants({ variant: "ghost", size: "xs" })}
              >
                Paste chat
              </Link>
              <OpenDialogButton kind="interaction" opts={{ orgId: project.orgId, projectId: id }} variant="ghost" size="xs">
                Log
              </OpenDialogButton>
            </div>
          </div>
          <Timeline interactions={interactions} threads={threads} crm={crm} projects={pickers.projects} showLinks={false} />
        </section>
      </div>
    </div>
  );
}
