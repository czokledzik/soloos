import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { PortalThemeToggle } from "@/components/app/portal-controls";
import {
  PortalDecisions,
  PortalDoc,
  PortalHeader,
  PortalHours,
  PortalOverview,
  hasOverview,
  portalTitle,
} from "@/components/app/portal-sections";
import { buttonVariants } from "@/components/ui/button";
import { portalText } from "@/lib/portal-text";
import { cn } from "@/lib/utils";
import { getPortal } from "@/server/portal-queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const portal = await getPortal((await params).token);
  return {
    title: { absolute: portal ? portalTitle(portal) : portalText("en").fallbackTitle },
    robots: { index: false, follow: false },
  };
}

/**
 * Read-only client portal: overview (progress, updates), hours report, decision log and the
 * published docs, one section at a time (?tab=…), plus a print/PDF view of the docs. No login,
 * the link is the key. In the project's portal language.
 */
export default async function PortalPage({ params, searchParams }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const portal = await getPortal(token);
  if (!portal) notFound();
  const t = portalText(portal.lang);

  // Order of the menu, and the first one is what the client lands on: the project and its docs
  // first, the hours report (with amounts) last, under its own heading.
  const sections = [
    ...(hasOverview(portal) ? [{ key: "overview", title: t.overview }] : []),
    ...(portal.decisions ? [{ key: "decisions", title: t.decisions }] : []),
  ];
  const docTabs = portal.docs.map((d) => ({ key: String(d.id), title: d.title }));
  const billing = portal.hours ? [{ key: "hours", title: t.hoursReport }] : [];
  const tabs = [...sections, ...docTabs, ...billing];
  const tabParam = (await searchParams).tab;
  const current = tabs.find((t) => t.key === tabParam) ?? tabs[0];
  const doc = portal.docs.find((d) => String(d.id) === current?.key);

  const tabLink = (t: { key: string; title: string }) => (
    <Link
      key={t.key}
      href={`?tab=${t.key}`}
      scroll={false}
      aria-current={t.key === current?.key ? "page" : undefined}
      className={cn(
        "shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground md:whitespace-normal",
        "aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground",
      )}
    >
      {t.title}
    </Link>
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10">
      <PortalHeader portal={portal}>
        <div className="flex gap-2">
          {portal.docs.length > 0 && (
            <Link href={`/p/${token}/print`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <DownloadIcon />
              {t.downloadPdf}
            </Link>
          )}
          <PortalThemeToggle labels={{ toDark: t.darkOn, toLight: t.darkOff, dark: t.dark, light: t.light }} />
        </div>
      </PortalHeader>

      <div className={cn("grid gap-6", tabs.length > 1 && "md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10")}>
        {tabs.length > 1 && (
          // A column of links on wide screens (doc titles are long), a scrolling strip on phones.
          <nav aria-label={t.sections} className="-mx-1 flex gap-1 overflow-x-auto pb-1 md:sticky md:top-6 md:mx-0 md:flex-col md:self-start md:overflow-visible">
            {sections.map(tabLink)}
            {docTabs.length > 0 && sections.length > 0 && <GroupHeading>{t.documentation}</GroupHeading>}
            {docTabs.map(tabLink)}
            {billing.length > 0 && tabs.length > billing.length && <GroupHeading>{t.billing}</GroupHeading>}
            {billing.map(tabLink)}
          </nav>
        )}

        <main className="min-w-0">
          {!current && <p className="text-sm text-muted-foreground">{t.nothingShared}</p>}
          {current?.key === "overview" && <PortalOverview portal={portal} />}
          {current?.key === "hours" && portal.hours && <PortalHours hours={portal.hours} t={t} />}
          {current?.key === "decisions" && portal.decisions && <PortalDecisions decisions={portal.decisions} t={t} />}
          {doc && <PortalDoc doc={doc} t={t} />}
        </main>
      </div>
    </div>
  );
}

/** Label above a group of links in the side menu (hidden in the phone strip). */
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden px-3 pt-4 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase md:block">{children}</div>
  );
}
