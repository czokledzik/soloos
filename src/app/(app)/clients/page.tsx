import Link from "next/link";
import { Empty, PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { ORG_STATUSES, labelOf } from "@/lib/labels";
import { listOrganizations } from "@/server/queries";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const orgs = await listOrganizations();
  return (
    <div>
      <PageHeader title="Clients" subtitle="Full CRM (contacts, timeline, interactions) lands in the next milestone." />
      <div className="px-6 pb-6">
        {orgs.length === 0 ? (
          <Empty>No clients yet. They are created along with projects for now.</Empty>
        ) : (
          <div className="divide-y rounded-xl border">
            {orgs.map((o) => (
              <Link key={o.id} href={`/clients/${o.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30">
                <span className="flex-1 font-medium">{o.name}</span>
                <Badge variant="secondary">{labelOf(ORG_STATUSES, o.status)}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
