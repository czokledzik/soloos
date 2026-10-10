import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Empty, PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { searchAll, snippet } from "@/server/search-queries";

export const metadata = { title: "Search" };

type Hit = { key: string; href: string; title: string; sub?: string; text?: string };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim() : "";
  const r = q.length >= 2 ? await searchAll(q) : null;

  const groups: [string, Hit[]][] = r
    ? [
        ["Clients", r.clients.map((c) => ({ key: `o${c.id}`, href: `/clients/${c.id}`, title: c.name }))],
        ["Contacts", r.contacts.map((c) => ({ key: `c${c.id}`, href: `/clients/${c.clientId}`, title: c.name, sub: c.clientName }))],
        ["Projects", r.projects.map((p) => ({ key: `p${p.id}`, href: `/projects/${p.id}/overview`, title: p.name }))],
        ["Tasks", r.tasks.map((t) => ({ key: `t${t.id}`, href: `/projects/${t.projectId}?task=${t.id}`, title: t.title }))],
        ["Leads", r.leads.map((l) => ({ key: `l${l.id}`, href: `/pipeline?opp=${l.id}`, title: l.title }))],
        [
          "Messages",
          r.messages.map((m) => ({
            key: `m${m.id}`,
            href: `/messages/${m.threadId}`,
            title: m.threadTitle || m.clientName,
            sub: `${m.clientName} · ${format(m.sentAt, "d MMM yyyy")}`,
            text: snippet(m.body, q),
          })),
        ],
        [
          "Logged conversations",
          r.conversations.map((c) => ({
            key: `i${c.id}`,
            href: `/clients/${c.clientId}`,
            title: c.title || c.clientName,
            sub: `${c.clientName} · ${format(c.occurredAt, "d MMM yyyy")}`,
            text: snippet(c.body, q),
          })),
        ],
        [
          "Decisions",
          r.decisions.map((d) => ({
            key: `d${d.id}`,
            href: `/projects/${d.projectId}/scope`,
            title: d.title,
            sub: format(parseISO(d.decidedOn), "d MMM yyyy"),
          })),
        ],
        ["Doc pages", r.docPages.map((p) => ({ key: `g${p.id}`, href: `/projects/${p.projectId}/docs?page=${p.id}`, title: p.title }))],
      ]
    : [];
  const found = groups.filter(([, hits]) => hits.length > 0);

  return (
    <div>
      <PageHeader title="Search" />
      <form className="px-6 pb-4" action="/search">
        <Input name="q" defaultValue={q} placeholder="Search everything…" className="max-w-md" autoFocus aria-label="Search" />
      </form>
      <div className="grid gap-6 px-6 pb-6">
        {q.length > 0 && q.length < 2 && <Empty>Type at least two characters.</Empty>}
        {r && found.length === 0 && <Empty>Nothing matches “{q}”.</Empty>}
        {found.map(([label, hits]) => (
          <section key={label}>
            <h2 className="mb-2 text-sm font-medium">{label}</h2>
            <div className="divide-y overflow-hidden rounded-xl border">
              {hits.map((h) => (
                <Link key={h.key} href={h.href} className="block px-3 py-2 text-sm hover:bg-muted/30">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{h.title}</span>
                    {h.sub && <span className="text-xs text-muted-foreground">{h.sub}</span>}
                  </div>
                  {h.text && <div className="mt-0.5 text-muted-foreground">{h.text}</div>}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
