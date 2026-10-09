"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { BriefcaseIcon, ExternalLinkIcon, MessageSquarePlusIcon, PencilIcon, Trash2Icon, ClipboardPasteIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatMoney } from "@/lib/format";
import { LEAD_SOURCES, OPPORTUNITY_STAGES, STAGE_DOT, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { convertOpportunityToProject, deleteOpportunity, setOpportunityStage } from "@/server/crm-actions";
import type { CrmPickers, InteractionRow, OpportunityDetail } from "@/server/crm-queries";
import type { PickerData } from "@/server/queries";
import { OpportunityForm } from "./crm-forms";
import { openGlobalDialog } from "./global-dialogs";
import { Timeline } from "./timeline";
import type { ThreadView } from "@/server/message-queries";
import { useAction } from "./use-action";

/** Side panel for a lead, driven by the ?opp= search param. */
export function OpportunitySheet({
  opp,
  interactions,
  threads,
  crm,
  projects,
  ai,
}: {
  opp: OpportunityDetail | null;
  interactions: InteractionRow[];
  threads: ThreadView[];
  /** "Ask Claude" panel for this lead, rendered by the page. */
  ai?: React.ReactNode;
  crm: CrmPickers;
  projects: PickerData["projects"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function close() {
    const next = new URLSearchParams(params);
    next.delete("opp");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Sheet open={opp != null} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        {opp && (
          <OpportunityPanel
            key={opp.id}
            opp={opp}
            interactions={interactions}
            threads={threads}
            crm={crm}
            projects={projects}
            ai={ai}
            onDeleted={close}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function OpportunityPanel({
  opp,
  interactions,
  threads,
  crm,
  projects,
  ai,
  onDeleted,
}: {
  opp: OpportunityDetail;
  interactions: InteractionRow[];
  threads: ThreadView[];
  ai?: React.ReactNode;
  crm: CrmPickers;
  projects: PickerData["projects"];
  onDeleted: () => void;
}) {
  const { pending, exec } = useAction();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [postOpen, setPostOpen] = useState(interactions.length === 0);
  const ofertownik = process.env.NEXT_PUBLIC_OFERTOWNIK_URL;

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetDescription>
          <Link href={`/clients/${opp.orgId}`} className="hover:underline">
            {opp.org.name}
          </Link>
          {opp.contact && opp.contact.name !== opp.org.name && ` · ${opp.contact.name}`}
        </SheetDescription>
        <SheetTitle className="text-lg">{opp.title}</SheetTitle>
        <div className="flex flex-wrap gap-1 pt-1">
          {OPPORTUNITY_STAGES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={pending}
              onClick={() => s.value !== opp.stage && exec(() => setOpportunityStage(opp.id, s.value))}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
                s.value === opp.stage ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              <span className={cn("size-1.5 rounded-full", STAGE_DOT[s.value])} />
              {s.label}
            </button>
          ))}
        </div>
      </SheetHeader>

      <div className="grid flex-1 content-start gap-5 overflow-y-auto p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Fact label="Next action">
            {opp.nextAction ? `${opp.nextAction}${opp.nextActionAt ? ` · ${formatDate(opp.nextActionAt, "d MMM")}` : ""}` : "—"}
          </Fact>
          <Fact label="Estimated value">{formatMoney(opp.estValue, opp.org.currency)}</Fact>
          <Fact label="Source">
            {labelOf(LEAD_SOURCES, opp.source)}
            {opp.sourceDetail && ` · ${opp.sourceDetail}`}
            {opp.sourceUrl && (
              <a href={opp.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle">
                <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </Fact>
          <Fact label="Added">{format(opp.createdAt, "d MMM yyyy")}</Fact>
          {opp.offerSlug && (
            <Fact label="Proposal">
              {ofertownik ? (
                <a href={`${ofertownik}/o/${opp.offerSlug}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {opp.offerSlug}
                </a>
              ) : (
                opp.offerSlug
              )}
            </Fact>
          )}
          {opp.stage === "lost" && opp.lostReason && <Fact label="Lost because">{opp.lostReason}</Fact>}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => openGlobalDialog("interaction", { orgId: opp.orgId, opportunityId: opp.id })}
          >
            <MessageSquarePlusIcon /> Log conversation
          </Button>
          <Link
            href={`/messages/new?org=${opp.orgId}&lead=${opp.id}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <ClipboardPasteIcon /> Paste chat
          </Link>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PencilIcon /> Edit
          </Button>
          {opp.project ? (
            <Link href={`/projects/${opp.project.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
              <BriefcaseIcon /> {opp.project.name}
            </Link>
          ) : (
            opp.stage !== "lost" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={async () => {
                  const res = await exec(() => convertOpportunityToProject(opp.id), "Project created");
                  if (res.ok && res.data) router.push(`/projects/${res.data}`);
                }}
              >
                <BriefcaseIcon /> Won → create project
              </Button>
            )
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={async () => {
              if (!confirm("Delete this lead? Logged conversations stay on the client.")) return;
              const res = await exec(() => deleteOpportunity(opp.id), "Lead deleted");
              if (res.ok) onDeleted();
            }}
          >
            <Trash2Icon />
          </Button>
        </div>

        {opp.originalPostMd && (
          <section>
            <button
              type="button"
              className="mb-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setPostOpen((o) => !o)}
            >
              {postOpen ? "▾" : "▸"} Original post
            </button>
            {postOpen && (
              <div className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">{opp.originalPostMd}</div>
            )}
          </section>
        )}

        {ai}

        <section>
          <h3 className="mb-2 text-sm font-medium">Conversations</h3>
          <Timeline interactions={interactions} threads={threads} crm={crm} projects={projects} showLinks={false} />
        </section>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
          </DialogHeader>
          <OpportunityForm opp={opp} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
