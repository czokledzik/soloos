import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { PrintToolbar } from "@/components/app/portal-controls";
import { PortalDoc, PortalHeader, PortalOverview, hasOverview, portalTitle } from "@/components/app/portal-sections";
import { getPortal } from "@/server/portal-queries";

export const dynamic = "force-dynamic";

// The title becomes the default PDF file name.
export async function generateMetadata({ params }: PageProps<"/p/[token]/print">): Promise<Metadata> {
  const portal = await getPortal((await params).token);
  return {
    title: { absolute: portal ? portalTitle(portal) : "Project status" },
    robots: { index: false, follow: false },
  };
}

/** Everything the portal shares on one page (always light), for printing or saving as PDF. */
export default async function PortalPrintPage({ params }: PageProps<"/p/[token]/print">) {
  const { token } = await params;
  const portal = await getPortal(token);
  if (!portal) notFound();

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-6 py-8 [print-color-adjust:exact] print:max-w-none print:p-0">
      <PrintToolbar backHref={`/p/${token}`} />
      <PortalHeader portal={portal}>
        <div className="text-xs text-muted-foreground">{format(new Date(), "d MMMM yyyy")}</div>
      </PortalHeader>

      {portal.docs.length > 1 && (
        <nav aria-label="Contents" className="grid gap-1 text-sm">
          <h2 className="font-semibold">Contents</h2>
          {/* Titles like "1. Overview" are already numbered. */}
          <ol className={portal.docs.some((d) => /^\d/.test(d.title)) ? "text-muted-foreground" : "list-decimal pl-5 text-muted-foreground"}>
            {hasOverview(portal) && <li>Overview</li>}
            {portal.docs.map((d) => (
              <li key={d.id}>{d.title}</li>
            ))}
          </ol>
        </nav>
      )}

      {hasOverview(portal) && (
        <div className="grid gap-4 break-before-page">
          <h2 className="text-lg font-semibold">Overview</h2>
          <PortalOverview portal={portal} />
        </div>
      )}
      {portal.docs.map((d) => (
        <div key={d.id} className="break-before-page">
          <PortalDoc doc={d} print />
        </div>
      ))}
    </div>
  );
}
