import { notFound } from "next/navigation";
import { DocPageList, DocPageView, DocTemplateButtons, NewDocPageButton, SystemsCard } from "@/components/app/docs-panels";
import { Empty } from "@/components/app/page-header";
import { DOC_TEMPLATES } from "@/lib/doc-templates";
import { getDocPage, listDocPages, listSystems } from "@/server/doc-queries";

export default async function ProjectDocsPage({ params, searchParams }: PageProps<"/projects/[id]/docs">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const pageParam = Number((await searchParams).page);
  const [pages, systems] = await Promise.all([listDocPages(id), listSystems(id)]);
  const currentId = pages.some((p) => p.id === pageParam) ? pageParam : (pages[0]?.id ?? null);
  const page = currentId ? await getDocPage(currentId) : null;

  return (
    <div className="grid gap-6 px-6 pb-6 lg:grid-cols-[12rem_minmax(0,1fr)_18rem]">
      <aside className="grid content-start gap-2">
        <NewDocPageButton projectId={id} />
        <DocTemplateButtons
          projectId={id}
          templates={DOC_TEMPLATES.map((t) => ({
            id: t.id,
            name: t.name,
            short: t.short,
            description: t.description,
            pages: t.pages.length,
            questions: t.questions.length,
          }))}
        />
        <DocPageList projectId={id} pages={pages} current={currentId} />
      </aside>
      <section className="min-w-0">
        {page ? (
          <DocPageView key={`${page.id}-${page.updatedAt.getTime()}`} page={page} projectId={id} />
        ) : (
          <Empty>
            No pages yet. Add one for architecture notes, specs or handover docs, or start from a template. Diagrams in
            ```mermaid blocks are rendered with pan and zoom.
          </Empty>
        )}
      </section>
      <aside className="grid content-start gap-4">
        <SystemsCard projectId={id} systems={systems} />
      </aside>
    </div>
  );
}
