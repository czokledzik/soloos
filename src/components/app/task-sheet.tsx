"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClockIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { TaskStatus } from "@/db/schema";
import { PRIORITIES, TASK_STATUSES } from "@/lib/labels";
import { formatMinutes, parseDuration } from "@/lib/format";
import { deleteTask, updateTask, type TaskPatch } from "@/server/actions";
import type { PickerData, TaskRow } from "@/server/queries";
import { TimerButton } from "./buttons";
import { Field } from "./field";
import { ProjectPicker } from "./forms";
import { openGlobalDialog } from "./global-dialogs";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

/** Side panel for a task, driven by the ?task= search param. */
export function TaskSheet({
  task,
  projects,
  running,
}: {
  task: TaskRow | null;
  projects: PickerData["projects"];
  running: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function close() {
    const next = new URLSearchParams(params);
    next.delete("task");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Sheet open={task != null} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        {task && <TaskEditor key={task.id} task={task} projects={projects} running={running} onDeleted={close} />}
      </SheetContent>
    </Sheet>
  );
}

function TaskEditor({
  task,
  projects,
  running,
  onDeleted,
}: {
  task: TaskRow;
  projects: PickerData["projects"];
  running: boolean;
  onDeleted: () => void;
}) {
  const { exec } = useAction();
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.bodyMd);
  const [due, setDue] = useState(task.dueDate ?? "");
  const [estimate, setEstimate] = useState(task.estimateMin ? formatMinutes(task.estimateMin) : "");

  const save = (patch: TaskPatch) => exec(() => updateTask(task.id, patch));

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetDescription>
          {task.orgName} · {task.projectName}
        </SheetDescription>
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-auto border-none px-0 text-lg font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </SheetHeader>
      <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <NativeSelect
              value={task.status}
              onChange={(e) => save({ status: e.target.value as TaskStatus })}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priority">
            <NativeSelect value={task.priority} onChange={(e) => save({ priority: Number(e.target.value) })}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due">
            <Input
              type="date"
              value={due}
              onChange={(e) => {
                setDue(e.target.value);
                save({ dueDate: e.target.value || null });
              }}
            />
          </Field>
          <Field label="Estimate">
            <Input
              value={estimate}
              placeholder="e.g. 2h"
              onChange={(e) => setEstimate(e.target.value)}
              onBlur={() => {
                const min = estimate.trim() ? parseDuration(estimate) : null;
                if (min !== task.estimateMin) save({ estimateMin: min });
              }}
            />
          </Field>
          <Field label="Project" className="col-span-2">
            <ProjectPicker
              name="projectId"
              projects={projects}
              value={task.projectId}
              onChange={(id) => id && id !== task.projectId && save({ projectId: id })}
            />
          </Field>
        </div>

        <div className="flex items-center gap-2 rounded-lg border p-3">
          <ClockIcon className="size-4 text-muted-foreground" />
          <span className="text-sm">
            <span className="font-medium tabular-nums">{formatMinutes(task.trackedMin)}</span>
            <span className="text-muted-foreground">
              {" "}tracked{task.estimateMin ? ` of ${formatMinutes(task.estimateMin)} estimated` : ""}
            </span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => openGlobalDialog("time", { projectId: task.projectId, taskId: task.id })}
            >
              Log time
            </Button>
            <TimerButton
              projectId={task.projectId}
              taskId={task.id}
              running={running}
              size="sm"
              variant="outline"
              label={running ? "Stop" : "Start"}
            />
          </div>
        </div>

        <Field label="Description">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => body !== task.bodyMd && save({ bodyMd: body })}
            placeholder="Notes, acceptance criteria, links…"
            className="min-h-48 font-mono text-sm"
          />
        </Field>
      </div>
      <div className="flex justify-end border-t p-3">
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            if (!confirm("Delete this task? Logged time stays, but loses its task link.")) return;
            const res = await exec(() => deleteTask(task.id), "Task deleted");
            if (res.ok) onDeleted();
          }}
        >
          <Trash2Icon /> Delete
        </Button>
      </div>
    </>
  );
}
