import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { OpenDialogButton } from "@/components/app/buttons";
import { ContactsCard, EditOrgButton } from "@/components/app/client-panels";
import { NotesEditor } from "@/components/app/notes-editor";
import { PageHeader } from "@/components/app/page-header";
import { Timeline, type TimelineEvent } from "@/components/app/timeline";
import { Badge } from "@/components/ui/badge";
import { formatHours, formatMoney } from "@/lib/format";
import { OPPORTUNITY_STAGES, ORG_STATUSES, PROJECT_STATUSES, STAGE_DOT, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { updateOrganizationNotes } from "@/server/crm-actions";
import { getCrmPickers, listInteractions, listOrgOpportunities } from "@/server/crm-queries";
import { getOrganization, getPickerData, listProjects } from "@/server/queries";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [org, allProjects, opps, interactions, crm, pickers] = await Promise.all([
    getOrganization(id),
    listProjects(),
    listOrgOpportunities(id),
    listInteractions({ orgId: id }),
    getCrmPickers(),
    getPickerData(),
  ]);
  if (!org) notFound();
  const projects = allProjects.filter((p) => p.org.id === id);
  const totalMin = projects.reduce((s, p) => s + p.totalMin, 0);

  const events: TimelineEvent[] = [
    ...opps.map((o) => ({
      key: `o${o.id}`,
      at: o.createdAt,
      label: `Lead added: ${o.title}`,
      href: `/pipeline?opp=${o.id}`,
      kind: "lead" as const,
    })),
    ...projects.map(({ project: p }) => ({
      key: `p${p.id}`,
      at: p.createdAt,
      label: `Project started: ${p.name}`,
      href: `/projects/${p.id}`,
      kind: "project" as const,
    })),
  ];

  return (
    <div>
      <PageHeader
        title={org.name}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{labelOf(ORG_STATUSES, org.status)}</Badge>
            {org.website && (
              <a
                href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                {org.website} <ExternalLinkIcon className="size-3" />
              </a>
            )}
            {org.defaultRate != null && <span>{formatMoney(org.defaultRate, org.currency)}/h default</span>}
            {totalMin > 0 && <span>{formatHours(totalMin)} tracked in total</span>}
          </div>
        }
        actions={
          <>
            <EditOrgButton org={org} />
            <OpenDialogButton kind="project" opts={{ orgId: id }} variant="outline">
              Project
            </OpenDialogButton>
            <OpenDialogButton kind="interaction" opts={{ orgId: id }}>
              Log conversation
            </OpenDialogButton>
          </>
        }
      />
      <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0">
          <h2 className="mb-3 text-sm font-medium">Timeline</h2>
          <Timeline interactions={interactions} events={events} crm={crm} projects={pickers.projects} />
        </section>
        <aside className="grid min-w-0 grid-cols-1 content-start gap-4">
          <ContactsCard orgId={id} contacts={org.contacts} />

          <section className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-medium">Leads</h2>
            </div>
            {opps.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">None.</p>
            ) : (
              <div className="divide-y">
                {opps.map((o) => (
                  <Link
                    key={o.id}
                    href={`/pipeline?opp=${o.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[o.stage])} />
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                    <span className="text-xs text-muted-foreground">{labelOf(OPPORTUNITY_STAGES, o.stage)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h2 className="text-sm font-medium">Projects</h2>
            </div>
            {projects.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">None.</p>
            ) : (
              <div className="divide-y">
                {projects.map(({ project: p, totalMin: min }) => (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30"
                  >
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{labelOf(PROJECT_STATUSES, p.status)}</span>
                    <span className="w-12 text-right text-xs tabular-nums">{formatHours(min)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">Notes</h2>
            <NotesEditor
              initial={org.notesMd}
              save={updateOrganizationNotes.bind(null, id)}
              placeholder="Who decides, how they like to communicate, access details location…"
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
