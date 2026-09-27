"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUSES } from "@/lib/labels";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveTask } from "@/server/actions";
import type { TaskRow } from "@/server/queries";
import { TimerButton } from "./buttons";
import { openGlobalDialog } from "./global-dialogs";
import { Kanban, type KanbanColumn } from "./kanban";
import { useTaskHref } from "./task-list";
import { DueDate, PriorityIcon, StatusIcon } from "./task-meta";
import { useAction } from "./use-action";

const statusOf = (t: TaskRow) => t.status;

export function TaskBoard({
  tasks,
  projectId,
  runningTaskId,
  showProject = false,
}: {
  tasks: TaskRow[];
  projectId?: number;
  runningTaskId: number | null;
  showProject?: boolean;
}) {
  const { exec } = useAction();
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const columns: KanbanColumn<TaskStatus>[] = TASK_STATUSES.map((s) => ({
    key: s.value,
    header: (ids) => {
      const minutes = ids.reduce((sum, id) => sum + (byId.get(id)?.trackedMin ?? 0), 0);
      return (
        <>
          <StatusIcon status={s.value} />
          <span className="font-medium">{s.label}</span>
          <span className="text-muted-foreground">{ids.length}</span>
          {minutes > 0 && <span className="text-xs text-muted-foreground">· {formatMinutes(minutes)}</span>}
          <button
            type="button"
            className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Add task"
            onClick={() => openGlobalDialog("task", { projectId, status: s.value })}
          >
            <PlusIcon className="size-4" />
          </button>
        </>
      );
    },
  }));

  return (
    <Kanban
      columns={columns}
      items={tasks}
      columnOf={statusOf}
      onMove={(id, status, ids) => exec(() => moveTask(id, status, ids))}
      renderCard={(task, { overlay }) => (
        <Card task={task} running={runningTaskId === task.id} showProject={showProject} overlay={overlay} />
      )}
    />
  );
}

function Card({
  task,
  running,
  showProject,
  overlay,
}: {
  task: TaskRow;
  running: boolean;
  showProject: boolean;
  overlay?: boolean;
}) {
  const href = useTaskHref(task);
  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-2.5 text-sm shadow-xs",
        overlay && "rotate-1 shadow-lg",
        running && "ring-2 ring-red-500/60",
      )}
    >
      <div className="flex items-start gap-2">
        <Link href={href} scroll={false} className="min-w-0 flex-1 leading-snug hover:underline">
          {task.title}
        </Link>
        <div className={cn("-mt-0.5 -mr-1", !running && "opacity-0 group-hover:opacity-100")}>
          <TimerButton projectId={task.projectId} taskId={task.id} running={running} size="icon-xs" />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <PriorityIcon priority={task.priority} />
        <DueDate date={task.dueDate} done={task.status === "done"} />
        {showProject && <span className="truncate text-xs text-muted-foreground">{task.projectName}</span>}
        {task.trackedMin > 0 && (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {formatMinutes(task.trackedMin)}
            {task.estimateMin ? ` / ${formatMinutes(task.estimateMin)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
