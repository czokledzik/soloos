import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenDialogButton, TimerButton } from "@/components/app/buttons";
import { EditProjectButton } from "@/components/app/edit-project-button";
import { PageHeader } from "@/components/app/page-header";
import { ProjectTabs } from "@/components/app/project-tabs";
import { Badge } from "@/components/ui/badge";
import { formatHours, formatMoney } from "@/lib/format";
import { CONTRACT_TYPES, PRICING, PROJECT_STATUSES, labelOf } from "@/lib/labels";
import { getProject, getRunningTimer, listOrganizations } from "@/server/queries";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [project, timer, orgs] = await Promise.all([getProject(id), getRunningTimer(), listOrganizations()]);
  if (!project) notFound();
  const projectTimerRunning = timer?.projectId === id && timer.taskId == null;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title={project.name}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${project.orgId}`} className="hover:underline">
              {project.org.name}
            </Link>
            <Badge variant="secondary">{labelOf(PROJECT_STATUSES, project.status)}</Badge>
            <Badge variant="outline">
              {labelOf(PRICING, project.pricing)}
              {project.pricing === "hourly" &&
                ` · ${formatMoney(project.hourlyRate ?? project.org.defaultRate, project.currency)}/h`}
              {project.pricing === "fixed" && ` · ${formatMoney(project.fixedPrice, project.currency)}`}
            </Badge>
            {project.contractType && <Badge variant="outline">{labelOf(CONTRACT_TYPES, project.contractType)}</Badge>}
            <span>
              {formatHours(project.totalMin)} tracked
              {project.budgetHours ? ` of ${project.budgetHours}h budget` : ""}
            </span>
          </div>
        }
        actions={
          <>
            <TimerButton
              projectId={id}
              running={projectTimerRunning}
              size="sm"
              variant="outline"
              label={projectTimerRunning ? "Stop" : "Start timer"}
            />
            <EditProjectButton project={project} orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
            <OpenDialogButton kind="task" opts={{ projectId: id }}>
              New task
            </OpenDialogButton>
          </>
        }
      />
      <ProjectTabs projectId={id} />
      <div className="flex-1 pt-4">{children}</div>
    </div>
  );
}
