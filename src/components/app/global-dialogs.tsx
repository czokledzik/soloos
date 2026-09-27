"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Organization } from "@/db/schema";
import type { PickerData } from "@/server/queries";
import { ProjectForm, TaskCreateForm, TimeEntryForm } from "./forms";

type DialogRequest =
  | { kind: "task"; projectId?: number; status?: string }
  | { kind: "time"; projectId?: number; taskId?: number; date?: string }
  | { kind: "project"; orgId?: number };

const EVENT = "global-dialog";

export function openGlobalDialog(kind: DialogRequest["kind"], opts: Omit<DialogRequest, "kind"> = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { kind, ...opts } }));
}

/** App-wide "new task / log time / new project" dialogs, openable from anywhere. */
export function GlobalDialogs({
  pickers,
  orgs,
}: {
  pickers: PickerData;
  orgs: Pick<Organization, "id" | "name">[];
}) {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const router = useRouter();

  useEffect(() => {
    const onOpen = (e: Event) => setReq((e as CustomEvent<DialogRequest>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  const close = () => setReq(null);
  const title = { task: "New task", time: "Log time", project: "New project" }[req?.kind ?? "task"];

  return (
    <Dialog open={req != null} onOpenChange={(o) => !o && close()}>
      <DialogContent className={req?.kind === "task" ? "sm:max-w-md" : "sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
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
            orgs={orgs}
            defaultOrgId={req.orgId}
            onDone={(id) => {
              close();
              if (id) router.push(`/projects/${id}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
