import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/app/portal-controls";
import { PortalDoc, PrintCover, portalTitle } from "@/components/app/portal-sections";
import { portalText } from "@/lib/portal-text";
import { getPortal } from "@/server/portal-queries";

export const dynamic = "force-dynamic";

// The title becomes the default PDF file name.
export async function generateMetadata({ params }: PageProps<"/p/[token]/print">): Promise<Metadata> {
  const portal = await getPortal((await params).token);
  return {
    title: { absolute: portal ? portalTitle(portal) : portalText("en").fallbackTitle },
    robots: { index: false, follow: false },
  };
}

/** Everything the portal shares on one page (always light), for printing or saving as PDF. */
export default async function PortalPrintPage({ params }: PageProps<"/p/[token]/print">) {
  const { token } = await params;
  const portal = await getPortal(token);
  if (!portal) notFound();
  const t = portalText(portal.lang);

  return (
    // Plain block layout: browsers split grid/flex containers across pages less reliably.
    // Zero page margins stop Chrome printing its URL/date header and footer (the URL carries the
    // portal token); the padding, repeated on every page by box-decoration-break, is the margin instead.
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 [print-color-adjust:exact] print:max-w-none print:p-[14mm] print:[box-decoration-break:clone]">
      <style>{"@page { size: A4; margin: 0; }"}</style>
      <PrintToolbar backHref={`/p/${token}`} labels={{ hint: t.printHint, back: t.back, save: t.saveAsPdf }} />
      <PrintCover portal={portal} />
      {/* Progress and updates are a status report, not documentation: the PDF holds only the docs. */}
      {portal.docs.map((d) => (
        <div key={d.id} className="break-before-page">
          <PortalDoc doc={d} t={t} print />
        </div>
      ))}
    </div>
  );
}
