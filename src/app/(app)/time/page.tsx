import Link from "next/link";
import { addDays, addWeeks, format, isValid, parseISO, startOfWeek } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { OpenDialogButton } from "@/components/app/buttons";
import { EntriesList } from "@/components/app/entries-list";
import { Empty, PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { entryValue } from "@/lib/billing";
import { formatMinutes, formatMoney, toDateString } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPickerData, listTimeEntries } from "@/server/queries";

export const metadata = { title: "Time" };

export default async function TimePage({ searchParams }: PageProps<"/time">) {
  const sp = await searchParams;
  const parsed = typeof sp.week === "string" ? parseISO(sp.week) : new Date();
  const weekStart = startOfWeek(isValid(parsed) ? parsed : new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [entries, pickers] = await Promise.all([listTimeEntries({ from: weekStart, to: weekEnd }), getPickerData()]);

  // Grid: project rows × day columns.
  type Row = { projectId: number; label: string; org: string; perDay: number[]; total: number };
  const rows = new Map<number, Row>();
  for (const e of entries) {
    const row =
      rows.get(e.projectId) ??
      { projectId: e.projectId, label: e.project.name, org: e.project.org.name, perDay: Array(7).fill(0), total: 0 };
    const dayIndex = Math.floor((e.startedAt.getTime() - weekStart.getTime()) / 86_400_000);
    row.perDay[Math.min(6, Math.max(0, dayIndex))] += e.durationMin;
    row.total += e.durationMin;
    rows.set(e.projectId, row);
  }
  const dayTotals = days.map((_, i) => [...rows.values()].reduce((s, r) => s + r.perDay[i], 0));
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + e.durationMin, 0);
  const valueByCurrency = new Map<string, number>();
  for (const e of entries) {
    const v = entryValue(e);
    if (v) valueByCurrency.set(e.project.currency, (valueByCurrency.get(e.project.currency) ?? 0) + v);
  }
  const today = toDateString(new Date());
  const weekParam = (d: Date) => `/time?week=${toDateString(d)}`;

  return (
    <div>
      <PageHeader
        title="Time"
        subtitle={
          <span>
            {format(weekStart, "d MMM")} – {format(addDays(weekStart, 6), "d MMM yyyy")} · {formatMinutes(weekTotal)} total ·{" "}
            {formatMinutes(billableMin)} billable
            {[...valueByCurrency].map(([cur, v]) => ` · ${formatMoney(v, cur)}`)}
          </span>
        }
        actions={
          <>
            <Link
              href={weekParam(addWeeks(weekStart, -1))}
              className={buttonVariants({ size: "icon-sm", variant: "outline" })}
            >
              <ChevronLeftIcon />
            </Link>
            <Link href="/time" className={buttonVariants({ size: "sm", variant: "outline" })}>
              This week
            </Link>
            <Link
              href={weekParam(addWeeks(weekStart, 1))}
              className={buttonVariants({ size: "icon-sm", variant: "outline" })}
            >
              <ChevronRightIcon />
            </Link>
            <OpenDialogButton kind="time">Log time</OpenDialogButton>
          </>
        }
      />
      <div className="grid gap-6 px-6 pb-6">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Project</th>
                {days.map((d) => (
                  <th
                    key={d.toISOString()}
                    className={cn("w-16 px-2 py-2 text-right font-medium", toDateString(d) === today && "text-foreground")}
                  >
                    {format(d, "EEE d")}
                  </th>
                ))}
                <th className="w-20 px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...rows.values()].map((r) => (
                <tr key={r.projectId}>
                  <td className="px-3 py-2">
                    <Link href={`/projects/${r.projectId}/time`} className="hover:underline">
                      {r.label}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">{r.org}</span>
                  </td>
                  {r.perDay.map((m, i) => (
                    <td key={i} className="px-2 py-2 text-right font-mono tabular-nums">
                      {m ? formatMinutes(m) : <span className="text-muted-foreground/40">–</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-medium tabular-nums">{formatMinutes(r.total)}</td>
                </tr>
              ))}
              {rows.size === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    No time this week.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.size > 0 && (
              <tfoot className="border-t bg-muted/20">
                <tr>
                  <td className="px-3 py-2 text-xs text-muted-foreground">Total</td>
                  {dayTotals.map((m, i) => (
                    <td key={i} className="px-2 py-2 text-right font-mono tabular-nums">
                      {m ? formatMinutes(m) : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatMinutes(weekTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {entries.length > 0 ? <EntriesList entries={entries} pickers={pickers} /> : <Empty>Nothing logged this week.</Empty>}
      </div>
    </div>
  );
}
