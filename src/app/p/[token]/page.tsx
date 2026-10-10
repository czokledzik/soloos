import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Markdown } from "@/components/app/markdown";
import { PROJECT_STATUSES, labelOf } from "@/lib/labels";
import { getPortal } from "@/server/portal-queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project status", robots: { index: false, follow: false } };

/** Read-only client portal: progress, published updates and docs. No login, the link is the key. */
export default async function PortalPage({ params }: PageProps<"/p/[token]">) {
  const portal = await getPortal((await params).token);
  if (!portal) notFound();
  const { progress } = portal;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-6 py-10">
      <header className="grid gap-1">
        <div className="text-sm text-muted-foreground">{portal.clientName}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{portal.name}</h1>
        <div className="text-sm text-muted-foreground">
          {labelOf(PROJECT_STATUSES, portal.status)}
          {portal.dueDate && ` · due ${format(parseISO(portal.dueDate), "d MMMM yyyy")}`}
        </div>
      </header>

      {progress.total > 0 && (
        <section className="grid gap-2" aria-label="Progress">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Progress</span>
            <span className="text-muted-foreground tabular-nums">
              {progress.done} of {progress.total} tasks done{progress.inProgress > 0 && ` · ${progress.inProgress} in progress`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </section>
      )}

      {portal.updates.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">Updates</h2>
          {portal.updates.map((u) => (
            <article key={u.id} className="rounded-xl border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{u.title}</h3>
                <time className="text-xs text-muted-foreground">{format(u.publishedAt, "d MMM yyyy")}</time>
              </div>
              <Markdown>{u.bodyMd}</Markdown>
            </article>
          ))}
        </section>
      )}

      {portal.docs.map((d) => (
        <section key={d.id} className="grid gap-2">
          <h2 className="text-lg font-semibold">{d.title}</h2>
          <Markdown>{d.bodyMd}</Markdown>
          <p className="text-xs text-muted-foreground">Updated {format(d.updatedAt, "d MMM yyyy")}</p>
        </section>
      ))}

      {portal.updates.length === 0 && portal.docs.length === 0 && progress.total === 0 && (
        <p className="text-sm text-muted-foreground">Nothing shared yet.</p>
      )}
    </div>
  );
}
