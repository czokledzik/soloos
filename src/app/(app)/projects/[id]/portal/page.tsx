import { and, asc, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PortalDocs, PortalLink, ProjectUpdates } from "@/components/app/portal-panels";
import { db, docPages, projects } from "@/db";
import { listProjectUpdates } from "@/server/portal-queries";

export default async function ProjectPortalPage({ params }: PageProps<"/projects/[id]/portal">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [project, updates, pages] = await Promise.all([
    db.query.projects.findFirst({
      where: eq(projects.id, id),
      columns: { portalToken: true, portalProgress: true, portalHours: true, portalDecisions: true, portalLang: true },
    }),
    listProjectUpdates(id),
    db
      .select({ id: docPages.id, title: docPages.title, published: docPages.published })
      .from(docPages)
      .where(and(eq(docPages.projectId, id), isNull(docPages.archivedAt)))
      .orderBy(asc(docPages.sortOrder), asc(docPages.id)),
  ]);
  if (!project) notFound();
  return (
    <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-6">
        <PortalLink
          projectId={id}
          token={project.portalToken}
          origin={await requestOrigin()}
          sections={{ progress: project.portalProgress, hours: project.portalHours, decisions: project.portalDecisions }}
          lang={project.portalLang}
        />
        <ProjectUpdates projectId={id} updates={updates} />
      </div>
      <PortalDocs pages={pages} />
    </div>
  );
}

async function requestOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
