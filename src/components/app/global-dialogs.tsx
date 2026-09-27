"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CrmPickers } from "@/server/crm-queries";
import type { PickerData } from "@/server/queries";
import { InteractionForm, LeadForm, OrgForm } from "./crm-forms";
import { ProjectForm, TaskCreateForm, TimeEntryForm } from "./forms";

type DialogRequest =
  | { kind: "task"; projectId?: number; status?: string }
  | { kind: "time"; projectId?: number; taskId?: number; date?: string }
  | { kind: "project"; orgId?: number }
  | { kind: "lead" }
  | { kind: "interaction"; orgId?: number; opportunityId?: number; projectId?: number }
  | { kind: "org" };

type Kind = DialogRequest["kind"];

const EVENT = "global-dialog";

const TITLES: Record<Kind, string> = {
  task: "New task",
  time: "Log time",
  project: "New project",
  lead: "Add lead",
  interaction: "Log conversation",
  org: "New client",
};

const WIDTHS: Record<Kind, string> = {
  task: "sm:max-w-md",
  time: "sm:max-w-xl",
  project: "sm:max-w-xl",
  lead: "sm:max-w-2xl",
  interaction: "sm:max-w-2xl",
  org: "sm:max-w-md",
};

export function openGlobalDialog<K extends Kind>(
  kind: K,
  opts: Omit<Extract<DialogRequest, { kind: K }>, "kind"> = {} as Omit<Extract<DialogRequest, { kind: K }>, "kind">,
) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, ...opts } }));
}

/** App-wide create dialogs, openable from anywhere via openGlobalDialog(). */
export function GlobalDialogs({ pickers, crm }: { pickers: PickerData; crm: CrmPickers }) {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onOpen = (e: Event) => setReq((e as CustomEvent<DialogRequest>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = () => setReq(null);

  return (
    <Dialog open={req != null} onOpenChange={(o) => !o && close()}>
      <DialogContent className={req ? WIDTHS[req.kind] : undefined}>
        <DialogHeader>
          <DialogTitle>{req ? TITLES[req.kind] : ""}</DialogTitle>
        </DialogHeader>
        {req?.kind === "task" && (
          <TaskCreateForm
            projects={pickers.projects}
            defaultProjectId={req.projectId}
            defaultStatus={req.status}
            onDone={close}
          />
        )}
        {req?.kind === "time" && (
          <TimeEntryForm
            pickers={pickers}
            defaultProjectId={req.projectId}
            defaultTaskId={req.taskId}
            defaultDate={req.date}
            onDone={close}
          />
        )}
        {req?.kind === "project" && (
          <ProjectForm
            orgs={crm.orgs}
            defaultOrgId={req.orgId}
            onDone={(id) => {
              close();
              if (id) router.push(`/projects/${id}`);
            }}
          />
        )}
        {req?.kind === "lead" && (
          <LeadForm
            crm={crm}
            onDone={(id) => {
              close();
              if (id) router.push(`/pipeline?opp=${id}`);
            }}
          />
        )}
        {req?.kind === "interaction" && (
          <InteractionForm crm={crm} projects={pickers.projects} defaults={req} onDone={close} />
        )}
        {req?.kind === "org" && (
          <OrgForm
            onDone={(id) => {
              close();
              if (id) router.push(`/clients/${id}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
