import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenDialogButton } from "@/components/app/buttons";
import { Empty, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/format";
import { ORG_STATUSES, PROJECT_STATUSES, labelOf } from "@/lib/labels";
import { getOrganization, listProjects } from "@/server/queries";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [org, projects] = await Promise.all([getOrganization(id), listProjects()]);
  if (!org) notFound();
  const own = projects.filter((p) => p.org.id === id);

  return (
    <div>
      <PageHeader
        title={org.name}
        subtitle={<Badge variant="secondary">{labelOf(ORG_STATUSES, org.status)}</Badge>}
        actions={
          <OpenDialogButton kind="project" opts={{ orgId: id }}>
            New project
          </OpenDialogButton>
        }
      />
      <div className="grid gap-2 px-6 pb-6">
        <h2 className="text-sm font-medium">Projects</h2>
        {own.length === 0 ? (
          <Empty>No projects for this client.</Empty>
        ) : (
          <div className="divide-y rounded-xl border">
            {own.map(({ project: p, totalMin }) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                <span className="flex-1 font-medium">{p.name}</span>
                <Badge variant="outline">{labelOf(PROJECT_STATUSES, p.status)}</Badge>
                <span className="w-16 text-right tabular-nums text-muted-foreground">{formatHours(totalMin)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
