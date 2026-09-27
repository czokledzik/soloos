import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { CopyBlock } from "@/components/app/copy-block";
import { Empty, PageHeader, Stat } from "@/components/app/page-header";
import { ReportFilters } from "@/components/app/report-filters";
import { buttonVariants } from "@/components/ui/button";
import { effectiveRate } from "@/lib/billing";
import { formatDate, formatHours, formatMinutes, formatMoney, toDateString } from "@/lib/format";
import { GROUP_BY, groupEntries, workSummary } from "@/lib/report";
import { readReportParams } from "@/lib/report-params";
import { cn } from "@/lib/utils";
import { getCrmPickers } from "@/server/crm-queries";
import { getPickerData } from "@/server/queries";
import { getFixedPriceProjects, getReportEntries, getUnpaidPayments } from "@/server/report-queries";

export const metadata = { title: "Reports" };

function money(map: Map<string, number>) {
  return map.size ? [...map].map(([cur, v]) => formatMoney(v, cur)).join(" + ") : "—";
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams;
  const { period, filters, group, raw } = readReportParams(sp);
  const [entries, crm, pickers, fixed, unpaid] = await Promise.all([
    getReportEntries(filters),
    getCrmPickers(),
    getPickerData(),
    getFixedPriceProjects(filters.orgId),
    getUnpaidPayments(filters.orgId),
  ]);

  const groups = groupEntries(entries, group);
  const total = entries.reduce((s, e) => s + e.durationMin, 0);
  const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + e.durationMin, 0);
  const totalValue = new Map<string, number>();
  for (const g of groups) for (const [cur, v] of g.value) totalValue.set(cur, (totalValue.get(cur) ?? 0) + v);
  const exportQs = new URLSearchParams(Object.entries(raw).filter(([, v]) => v) as [string, string][]);
  const today = toDateString(new Date());
  const fixedShown = filters.projectId ? fixed.filter((p) => p.id === filters.projectId) : fixed;
  const unpaidShown = filters.projectId ? unpaid.filter((p) => p.projectId === filters.projectId) : unpaid;

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={period.label}
        actions={
          <Link
            href={`/reports/export?${exportQs}`}
            prefetch={false}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <DownloadIcon /> Export CSV
          </Link>
        }
      />
      <div className="grid gap-6 px-6 pb-6">
        <ReportFilters params={raw} orgs={crm.orgs} projects={pickers.projects} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Tracked" value={formatHours(total)} sub={`${entries.length} entries`} />
          <Stat label="Billable" value={formatHours(billableMin)} sub={total ? `${Math.round((billableMin / total) * 100)}% of time` : undefined} />
          <Stat label="Non-billable" value={formatHours(total - billableMin)} />
          <Stat label="Billable value (hourly)" value={money(totalValue)} />
        </div>

        <section>
          <h2 className="mb-2 text-sm font-medium">
            By {GROUP_BY.find((g) => g.value === group)!.label.toLowerCase()}
          </h2>
          {groups.length === 0 ? (
            <Empty>No time in this period.</Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">{GROUP_BY.find((g) => g.value === group)!.label}</th>
                    <th className="w-1/4 px-3 py-2 font-medium" />
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">Billable</th>
                    <th className="px-3 py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{g.label}</div>
                        {g.sub && <div className="text-xs text-muted-foreground">{g.sub}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(g.minutes / total) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMinutes(g.minutes)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">
                        {formatMinutes(g.billableMin)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(g.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/20">
                  <tr>
                    <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{formatMinutes(total)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{formatMinutes(billableMin)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        {fixedShown.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium">Fixed-price projects (all time)</h2>
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Project</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-right font-medium">Hours</th>
                    <th className="px-3 py-2 text-right font-medium">Effective rate</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fixedShown.map((p) => {
                    const paid = p.payments.filter((x) => x.paidAt).reduce((s, x) => s + x.amount, 0);
                    const outstanding = (p.fixedPrice ?? 0) - paid;
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2">
                          <Link href={`/projects/${p.id}/payments`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">{p.org.name}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.fixedPrice, p.currency)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{formatHours(p.totalMin)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {p.totalMin ? `${formatMoney(effectiveRate(p.fixedPrice, p.totalMin), p.currency)}/h` : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-emerald-600 tabular-nums">{formatMoney(paid, p.currency)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", outstanding > 0 && "text-amber-600")}>
                          {formatMoney(outstanding, p.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {unpaidShown.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium">Unpaid payments</h2>
            <div className="divide-y rounded-xl border">
              {unpaidShown.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.projectId}/payments`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30"
                >
                  <span className="flex-1">
                    {p.label} <span className="text-muted-foreground">· {p.orgName} · {p.projectName}</span>
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      p.dueDate && p.dueDate < today ? "font-medium text-red-500" : "text-muted-foreground",
                    )}
                  >
                    {p.dueDate ? `due ${formatDate(p.dueDate, "d MMM")}` : "no due date"}
                  </span>
                  <span className="w-28 text-right font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {entries.length > 0 && (
          <section>
            <h2 className="mb-1 text-sm font-medium">Work summary</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Tasks and hours for the filtered period — paste into Useme/Bizky or a client update.
            </p>
            <CopyBlock text={workSummary(entries, period.label)} />
          </section>
        )}
      </div>
    </div>
  );
}
