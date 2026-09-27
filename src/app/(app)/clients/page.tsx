import Link from "next/link";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";
import { OpenDialogButton } from "@/components/app/buttons";
import { Empty, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { formatHours } from "@/lib/format";
import { ORG_STATUSES, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { listClients } from "@/server/crm-queries";

export const metadata = { title: "Clients" };

const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "lead", label: "Leads" },
  { value: "past", label: "Past" },
  { value: "internal", label: "Internal" },
];

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const status = (await searchParams).status;
  const all = await listClients();
  const rows = status ? all.filter((r) => r.org.status === status) : all;

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${all.filter((r) => r.org.status === "active").length} active · ${all.filter((r) => r.org.status === "lead").length} leads`}
        actions={<OpenDialogButton kind="org">New client</OpenDialogButton>}
      />
      <div className="flex gap-1 px-6 pb-3 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/clients?status=${f.value}` : "/clients"}
            className={cn(
              "rounded-md px-2 py-0.5",
              (status ?? "") === f.value ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>
      <div className="px-6 pb-6">
        {rows.length === 0 ? (
          <Empty>No clients here.</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Open leads</th>
                  <th className="px-3 py-2 text-right font-medium">Active projects</th>
                  <th className="px-3 py-2 text-right font-medium">This month</th>
                  <th className="px-3 py-2 text-right font-medium">Last conversation</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ org, openOpps, activeProjects, monthMin, lastContactAt }) => {
                  const stale =
                    org.status === "active" &&
                    (!lastContactAt || differenceInCalendarDays(new Date(), lastContactAt) > 30);
                  return (
                    <tr key={org.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/clients/${org.id}`} className="font-medium hover:underline">
                          {org.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{labelOf(ORG_STATUSES, org.status)}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{openOpps || ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{activeProjects || ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{monthMin ? formatHours(monthMin) : ""}</td>
                      <td className={cn("px-3 py-2 text-right", stale ? "text-amber-600" : "text-muted-foreground")}>
                        {lastContactAt ? formatDistanceToNowStrict(lastContactAt, { addSuffix: true }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
