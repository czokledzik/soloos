"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { PencilIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { entryValue } from "@/lib/billing";
import { formatMinutes, formatMoney, relativeDay, toDateString } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteTimeEntry, startTimer } from "@/server/actions";
import type { PickerData, TimeEntryRow } from "@/server/queries";
import { TimeEntryForm } from "./forms";
import { useAction } from "./use-action";

/** Time entries grouped by day, with edit/delete/restart. */
export function EntriesList({
  entries,
  pickers,
  showProject = true,
}: {
  entries: TimeEntryRow[];
  pickers: PickerData;
  showProject?: boolean;
}) {
  const [editing, setEditing] = useState<TimeEntryRow | null>(null);
  const { exec } = useAction();

  const days = new Map<string, TimeEntryRow[]>();
  for (const e of entries) {
    const key = toDateString(e.startedAt);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return (
    <div className="grid gap-5">
      {[...days].map(([day, list]) => {
        const total = list.reduce((s, e) => s + e.durationMin, 0);
        return (
          <section key={day}>
            <h3 className="mb-1 flex items-center justify-between px-1 text-sm">
              <span className="font-medium">{relativeDay(day)}</span>
              <span className="font-mono text-muted-foreground tabular-nums">{formatMinutes(total)}</span>
            </h3>
            <div className="divide-y rounded-xl border">
              {list.map((e) => {
                const value = entryValue(e);
                return (
                  <div key={e.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {e.task ? (
                          <Link href={`/projects/${e.projectId}?task=${e.task.id}`} className="hover:underline">
                            {e.task.title}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{e.note || "No task"}</span>
                        )}
                        {e.task && e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                      </div>
                      {showProject && (
                        <Link
                          href={`/projects/${e.projectId}`}
                          className="block truncate text-xs text-muted-foreground hover:underline"
                        >
                          {e.project.org.name} · {e.project.name}
                        </Link>
                      )}
                    </div>
                    <span className={cn("text-xs", e.billable ? "text-emerald-600" : "text-muted-foreground")}>
                      {e.billable ? (value ? formatMoney(value, e.project.currency) : "billable") : "non-billable"}
                    </span>
                    <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                      {format(e.startedAt, "HH:mm")}–{format(e.endedAt, "HH:mm")}
                    </span>
                    <span className="w-12 text-right font-mono tabular-nums">{formatMinutes(e.durationMin)}</span>
                    <div className="flex opacity-0 group-hover:opacity-100">
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Continue"
                        onClick={() => exec(() => startTimer(e.projectId, e.taskId, e.note), "Timer started")}
                      >
                        <PlayIcon />
                      </Button>
                      <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(e)}>
                        <PencilIcon />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete"
                        onClick={() => confirm("Delete this entry?") && exec(() => deleteTimeEntry(e.id), "Entry deleted")}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit time entry</DialogTitle>
          </DialogHeader>
          {editing && (
            <TimeEntryForm key={editing.id} pickers={pickers} entry={editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
