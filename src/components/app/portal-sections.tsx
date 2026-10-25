import { format } from "date-fns";
import { Markdown } from "@/components/app/markdown";
import { formatMoney } from "@/lib/format";
import { portalText, type PortalText } from "@/lib/portal-text";
import type { Portal } from "@/server/portal-queries";

/**
 * Content blocks of the client portal, shared by the tabbed page and the print/PDF view.
 * In the project's portal language (English or Polish); the app itself stays English.
 */

/** 1873 → "31 h 13 min" */
export function portalDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h} h`, (m || !h) && `${m} min`].filter(Boolean).join(" ");
}

export function PortalHeader({ portal, children }: { portal: Portal; children?: React.ReactNode }) {
  const t = portalText(portal.lang);
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <div className="text-sm text-muted-foreground">{portal.clientName}</div>
        <h1 className="text-2xl font-semibold tracking-tight">{portal.name}</h1>
        <div className="text-sm text-muted-foreground">
          {t.status[portal.status] ?? portal.status}
          {portal.dueDate && ` · ${t.due(t.day(portal.dueDate))}`}
        </div>
      </div>
      {children}
    </header>
  );
}

/** First page of the PDF: client, project, date and the list of sections, filling one A4 page. */
export function PrintCover({ portal }: { portal: Portal }) {
  const t = portalText(portal.lang);
  // Titles like "1. Overview" are already numbered.
  const numbered = portal.docs.some((d) => /^\d/.test(d.title));
  return (
    <header className="flex flex-col gap-12 border-t-4 border-primary pt-10 print:min-h-[calc(297mm-28mm)] print:break-after-page print:pt-[55mm]">
      <div className="grid gap-3">
        <div className="text-sm font-medium tracking-widest text-muted-foreground uppercase">{portal.clientName}</div>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-balance print:text-5xl">{portal.name}</h1>
        <div className="text-lg text-muted-foreground">{t.documentation} · {t.day(new Date())}</div>
      </div>
      {portal.docs.length > 1 && (
        <nav aria-label={t.contents} className="grid max-w-md gap-3 print:mt-auto">
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{t.contents}</h2>
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
export const hasOverview = (portal: Portal) => portal.progress !== null || portal.updates.length > 0;

export function PortalOverview({ portal }: { portal: Portal }) {
  const { progress } = portal;
  const t = portalText(portal.lang);
  return (
    <div className="grid gap-8">
      {progress && (
        <section className="grid gap-2" aria-label={t.progress}>
          <div className="flex justify-between text-sm">
            <span className="font-medium">{t.workProgress}</span>
            <span className="text-muted-foreground tabular-nums">
              {t.doneOf(progress.done, progress.total)}
              {progress.inProgress > 0 && ` · ${t.inProgress(progress.inProgress)}`}
            </span>
          </div>
          <Bar value={progress.done} max={progress.total} />
        </section>
      )}
      {portal.updates.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">{t.updates}</h2>
          {portal.updates.map((u) => (
            <article key={u.id} className="break-inside-avoid rounded-xl border p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-medium">{u.title}</h3>
                <time className="text-xs text-muted-foreground">{t.day(u.publishedAt)}</time>
              </div>
              <Markdown>{u.bodyMd}</Markdown>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-xl border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function PortalHours({ hours, t }: { hours: NonNullable<Portal["hours"]>; t: PortalText }) {
  const money = (minor: number) => formatMoney(minor, hours.currency);
  const budgetMin = hours.budgetHours ? hours.budgetHours * 60 : null;
  // Entries grouped by month, oldest first, like a running log.
  const months = new Map<string, typeof hours.entries>();
  for (const e of hours.entries) {
    const key = format(e.startedAt, "yyyy-MM");
    months.set(key, [...(months.get(key) ?? []), e]);
  }
  return (
    <div className="grid gap-8">
      <section className="grid gap-3" aria-label={t.summary}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label={t.hoursWorked}
            value={portalDuration(hours.totalMin)}
            hint={hours.rate !== null ? t.rate(money(hours.rate)) : undefined}
          />
          {hours.value !== null && <Stat label={t.workValue} value={money(hours.value)} />}
          {hours.payments.length > 0 && <Stat label={t.paid} value={money(hours.paid)} />}
          {hours.due !== null && <Stat label={hours.due >= 0 ? t.due_ : t.overpaid} value={money(Math.abs(hours.due))} />}
        </div>
        {budgetMin !== null && (
          <div className="grid gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t.budgetUsed(hours.budgetHours!)}</span>
              <span className="tabular-nums">{Math.round((hours.totalMin / budgetMin) * 100)}%</span>
            </div>
            <Bar value={hours.totalMin} max={budgetMin} />
          </div>
        )}
      </section>

      {hours.payments.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-lg font-semibold">{t.payments}</h2>
          <table className="w-full text-left text-sm">
            <tbody>
              {hours.payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 pr-2">{p.label}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{money(p.amount)}</td>
                  <td className="py-2 text-right text-muted-foreground">
                    {p.paidAt ? t.paidOn(t.day(p.paidAt)) : p.dueDate ? t.dueOn(t.day(p.dueDate)) : t.unpaid}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="grid gap-6">
        <h2 className="text-lg font-semibold">{t.workDone}</h2>
        {hours.entries.length === 0 && <p className="text-sm text-muted-foreground">{t.noEntries}</p>}
        {[...months.entries()].map(([key, entries]) => (
          <div key={key} className="grid gap-1 break-inside-avoid">
            <div className="flex items-baseline justify-between border-b pb-1">
              <h3 className="font-medium">{t.month(entries[0].startedAt)}</h3>
              <span className="text-sm text-muted-foreground tabular-nums">
                {portalDuration(entries.reduce((s, e) => s + e.durationMin, 0))}
              </span>
            </div>
            <table className="w-full text-left text-sm">
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="w-14 py-1.5 pr-2 whitespace-nowrap text-muted-foreground sm:w-20 sm:pr-3">
                      {t.shortDay(e.startedAt)}
                    </td>
                    <td className="py-1.5">{e.note || "—"}</td>
                    <td className="w-20 py-1.5 pl-2 text-right whitespace-nowrap tabular-nums sm:w-24">{portalDuration(e.durationMin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}

/** "me" / "both" / "Anna (client)" as the client should read them. */
function who(decidedBy: string | null, t: PortalText) {
  if (!decidedBy) return null;
  const v = decidedBy.trim();
  if (/^(me|ja)$/i.test(v)) return t.me;
  if (/^(both|obie strony|wspólnie)$/i.test(v)) return t.both;
  return v.replace(/\((client|klient)\)/i, t.client);
}

export function PortalDecisions({ decisions, t }: { decisions: NonNullable<Portal["decisions"]>; t: PortalText }) {
  if (decisions.length === 0) return <p className="text-sm text-muted-foreground">{t.noDecisions}</p>;
  return (
    <ol className="grid gap-3">
      {decisions.map((d) => (
        <li key={d.id} className="grid gap-1 rounded-xl border p-4 break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-medium">{d.title}</h3>
            <span className="text-xs text-muted-foreground">
              {t.day(d.decidedOn)}
              {who(d.decidedBy, t) && ` · ${who(d.decidedBy, t)}`}
            </span>
          </div>
          {d.detailsMd && <Markdown className="text-muted-foreground">{d.detailsMd}</Markdown>}
        </li>
      ))}
    </ol>
  );
}

export function PortalDoc({ doc, t, print = false }: { doc: Portal["docs"][number]; t: PortalText; print?: boolean }) {
  return (
    <section className="space-y-2">
      {/* The date sits under the title: as a footer it could end up alone on an otherwise empty PDF page. */}
      <header className="break-after-avoid">
        <h2 className="text-lg font-semibold">{doc.title}</h2>
        <p className="text-xs text-muted-foreground">{t.updated(t.day(doc.updatedAt))}</p>
      </header>
      <Markdown staticDiagrams={print}>{doc.bodyMd}</Markdown>
    </section>
  );
}
