import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Markdown } from "@/components/app/markdown";
import { PROJECT_STATUSES, labelOf } from "@/lib/labels";
import type { Portal } from "@/server/portal-queries";

/** Content blocks of the client portal, shared by the tabbed page and the print/PDF view. */

export function PortalHeader({ portal, children }: { portal: Portal; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <div className="text-sm text-muted-foreground">{portal.clientName}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{portal.name}</h1>
        <div className="text-sm text-muted-foreground">
          {labelOf(PROJECT_STATUSES, portal.status)}
          {portal.dueDate && ` · due ${format(parseISO(portal.dueDate), "d MMMM yyyy")}`}
        </div>
      </div>
      {children}
    </header>
  );
}

/** First page of the PDF: client, project, date and the list of sections, filling one A4 page. Polish, like the clients. */
export function PrintCover({ portal }: { portal: Portal }) {
  // Titles like "1. Overview" are already numbered.
  const numbered = portal.docs.some((d) => /^\d/.test(d.title));
  return (
    <header className="flex flex-col gap-12 border-t-4 border-primary pt-10 print:min-h-[calc(297mm-28mm)] print:break-after-page print:pt-[55mm]">
      <div className="grid gap-3">
        <div className="text-sm font-medium tracking-widest text-muted-foreground uppercase">{portal.clientName}</div>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance print:text-5xl">{portal.name}</h1>
        <div className="text-lg text-muted-foreground">Dokumentacja · {format(new Date(), "d MMMM yyyy", { locale: pl })}</div>
      </div>
      {portal.docs.length > 1 && (
        <nav aria-label="Spis treści" className="grid max-w-md gap-3 print:mt-auto">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Spis treści</h2>
          <ol className={numbered ? "grid gap-2" : "grid list-decimal gap-2 pl-5"}>
            {portal.docs.map((d) => (
              <li key={d.id} className="border-b pb-2 text-sm">
                {d.title}
              </li>
            ))}
          </ol>
        </nav>
      )}
    </header>
  );
}

/** Browser tab / PDF file name: "Project — Client", without repeating a client already in the name. */
export const portalTitle = (portal: Portal) =>
  portal.name.includes(portal.clientName) ? portal.name : `${portal.name} — ${portal.clientName}`;

/** True when the portal has something for the Overview tab (progress or updates). */
export const hasOverview = (portal: Portal) => portal.progress.total > 0 || portal.updates.length > 0;

export function PortalOverview({ portal }: { portal: Portal }) {
  const { progress } = portal;
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="grid gap-8">
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
            <article key={u.id} className="break-inside-avoid rounded-xl border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{u.title}</h3>
                <time className="text-xs text-muted-foreground">{format(u.publishedAt, "d MMM yyyy")}</time>
              </div>
              <Markdown>{u.bodyMd}</Markdown>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export function PortalDoc({ doc, print = false }: { doc: Portal["docs"][number]; print?: boolean }) {
  return (
    <section className="space-y-2">
      {/* The date sits under the title: as a footer it could end up alone on an otherwise empty PDF page. */}
      <header className="break-after-avoid">
        <h2 className="text-lg font-semibold">{doc.title}</h2>
        <p className="text-xs text-muted-foreground">
          {print ? `Aktualizacja: ${format(doc.updatedAt, "d MMMM yyyy", { locale: pl })}` : `Updated ${format(doc.updatedAt, "d MMM yyyy")}`}
        </p>
      </header>
      <Markdown staticDiagrams={print}>{doc.bodyMd}</Markdown>
    </section>
  );
}
