"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUSES } from "@/lib/labels";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/server/queries";
import { TimerButton } from "./buttons";
import { DueDate, PriorityIcon, StatusIcon } from "./task-meta";

/** Tasks grouped by status as dense rows. */
export function TaskList({
  tasks,
  runningTaskId,
  showProject = false,
  statuses = TASK_STATUSES.map((s) => s.value),
}: {
  tasks: TaskRow[];
  runningTaskId: number | null;
  showProject?: boolean;
  statuses?: TaskStatus[];
}) {
  return (
    <div className="grid gap-6 px-6 pb-6">
      {TASK_STATUSES.filter((s) => statuses.includes(s.value)).map((s) => {
        const rows = tasks.filter((t) => t.status === s.value);
        if (rows.length === 0) return null;
        return (
          <section key={s.value}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <StatusIcon status={s.value} /> {s.label}
              <span className="font-normal text-muted-foreground">{rows.length}</span>
            </h2>
            <div className="divide-y rounded-xl border">
              {rows.map((t) => (
                <TaskListRow key={t.id} task={t} running={runningTaskId === t.id} showProject={showProject} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Link that opens a task's side panel, keeping other query params on the current page. */
export function useTaskHref(task: Pick<TaskRow, "id">) {
  const pathname = usePathname();
  const params = useSearchParams();
  const next = new URLSearchParams(params);
  next.set("task", String(task.id));
  return `${pathname}?${next}`;
}

export function TaskListRow({ task, running, showProject }: { task: TaskRow; running: boolean; showProject: boolean }) {
  const href = useTaskHref(task);
  return (
    <div className={cn("group flex items-center gap-3 px-3 py-2 text-sm", running && "bg-red-500/5")}>
      <StatusIcon status={task.status} />
      <PriorityIcon priority={task.priority} />
      <Link href={href} scroll={false} className="min-w-0 flex-1 truncate hover:underline">
        {task.title}
      </Link>
      {showProject && (
        <Link href={`/projects/${task.projectId}`} className="hidden max-w-56 truncate text-xs text-muted-foreground hover:underline md:block">
          {task.orgName} · {task.projectName}
        </Link>
      )}
      <DueDate date={task.dueDate} done={task.status === "done"} />
      <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
        {task.trackedMin > 0 ? formatMinutes(task.trackedMin) : ""}
        {task.estimateMin ? ` / ${formatMinutes(task.estimateMin)}` : ""}
      </span>
      <div className={cn(!running && "opacity-0 group-hover:opacity-100")}>
        <TimerButton projectId={task.projectId} taskId={task.id} running={running} size="icon-xs" />
      </div>
    </div>
  );
}
