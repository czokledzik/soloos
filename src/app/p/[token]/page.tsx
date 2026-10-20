import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { PortalThemeToggle } from "@/components/app/portal-controls";
import { PortalDoc, PortalHeader, PortalOverview, hasOverview, portalTitle } from "@/components/app/portal-sections";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPortal } from "@/server/portal-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const portal = await getPortal((await params).token);
  return {
    title: { absolute: portal ? portalTitle(portal) : "Project status" },
    robots: { index: false, follow: false },
  };
}

/**
 * Read-only client portal: progress, published updates and docs, one tab each (?tab=overview or a
 * doc id), plus a print/PDF view of everything. No login, the link is the key.
 */
export default async function PortalPage({ params, searchParams }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const portal = await getPortal(token);
  if (!portal) notFound();

  const tabs = [
    ...(hasOverview(portal) ? [{ key: "overview", title: "Overview" }] : []),
    ...portal.docs.map((d) => ({ key: String(d.id), title: d.title })),
  ];
  const tabParam = (await searchParams).tab;
  const current = tabs.find((t) => t.key === tabParam) ?? tabs[0];
  const doc = portal.docs.find((d) => String(d.id) === current?.key);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-6 py-10">
      <PortalHeader portal={portal}>
        <div className="flex gap-2">
          {tabs.length > 0 && (
            <Link href={`/p/${token}/print`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <DownloadIcon />
              Download PDF
            </Link>
          )}
          <PortalThemeToggle />
        </div>
      </PortalHeader>

      {tabs.length > 1 && (
        <nav aria-label="Sections" className="-mx-1 flex flex-wrap gap-x-1 border-b">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`?tab=${t.key}`}
              scroll={false}
              aria-current={t.key === current?.key ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                "aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-foreground",
              )}
            >
              {t.title}
            </Link>
          ))}
        </nav>
      )}

      {!current && <p className="text-sm text-muted-foreground">Nothing shared yet.</p>}
      {current?.key === "overview" && <PortalOverview portal={portal} />}
      {doc && <PortalDoc doc={doc} />}
    </div>
  );
}
