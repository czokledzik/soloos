"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusIcon } from "lucide-react";
import type { TaskStatus } from "@/db/schema";
import { TASK_STATUSES } from "@/lib/labels";
import { formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveTask } from "@/server/actions";
import type { TaskRow } from "@/server/queries";
import { TimerButton } from "./buttons";
import { useTaskHref } from "./task-list";
import { openGlobalDialog } from "./global-dialogs";
import { DueDate, PriorityIcon, StatusIcon } from "./task-meta";
import { useAction } from "./use-action";

type Columns = Record<TaskStatus, number[]>;

function group(tasks: TaskRow[]): Columns {
  const cols = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, [] as number[]])) as Columns;
  for (const t of tasks) cols[t.status].push(t.id);
  return cols;
}

const COL_PREFIX = "col:";

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
  const [columns, setColumns] = useState(() => group(tasks));
  const [prevTasks, setPrevTasks] = useState(tasks);
  const [activeId, setActiveId] = useState<number | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Re-sync with server data after mutations.
  if (tasks !== prevTasks) {
    setPrevTasks(tasks);
    setColumns(group(tasks));
  }

  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function findColumn(id: UniqueIdentifier): TaskStatus | null {
    if (typeof id === "string" && id.startsWith(COL_PREFIX)) return id.slice(COL_PREFIX.length) as TaskStatus;
    for (const [status, ids] of Object.entries(columns)) if (ids.includes(id as number)) return status as TaskStatus;
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as number);
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const toIds = cols[to];
      const overIndex = toIds.indexOf(over.id as number);
      const index = overIndex >= 0 ? overIndex : toIds.length;
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...toIds.slice(0, index), active.id as number, ...toIds.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const col = findColumn(active.id);
    const overCol = findColumn(over.id);
    if (!col || col !== overCol) return;
    let ids = columns[col];
    const oldIndex = ids.indexOf(active.id as number);
    const newIndex = ids.indexOf(over.id as number);
    if (newIndex >= 0 && oldIndex !== newIndex) ids = arrayMove(ids, oldIndex, newIndex);
    setColumns((c) => ({ ...c, [col]: ids }));
    const original = byId.get(active.id as number);
    if (original?.status === col && oldIndex === newIndex) return;
    exec(() => moveTask(active.id as number, col, ids));
  }

  const active = activeId != null ? byId.get(activeId) : undefined;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setColumns(group(tasks));
      }}
    >
      <div className="flex min-h-0 gap-3 overflow-x-auto px-6 pb-6">
        {TASK_STATUSES.map((s) => (
          <Column
            key={s.value}
            status={s.value}
            label={s.label}
            ids={columns[s.value]}
            byId={byId}
            projectId={projectId}
            runningTaskId={runningTaskId}
            showProject={showProject}
          />
        ))}
      </div>
      <DragOverlay>
        {active && <Card task={active} running={false} showProject={showProject} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  label,
  ids,
  byId,
  projectId,
  runningTaskId,
  showProject,
}: {
  status: TaskStatus;
  label: string;
  ids: number[];
  byId: Map<number, TaskRow>;
  projectId?: number;
  runningTaskId: number | null;
  showProject: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL_PREFIX + status });
  const minutes = ids.reduce((sum, id) => sum + (byId.get(id)?.trackedMin ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm">
        <StatusIcon status={status} />
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{ids.length}</span>
        {minutes > 0 && <span className="text-xs text-muted-foreground">· {formatMinutes(minutes)}</span>}
        <button
          type="button"
          className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Add task"
          onClick={() => openGlobalDialog("task", { projectId, status })}
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-muted/40 p-2 transition-colors",
            isOver && "bg-muted",
          )}
        >
          {ids.map((id) => {
            const t = byId.get(id);
            return t ? <SortableCard key={id} task={t} running={runningTaskId === id} showProject={showProject} /> : null;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ task, running, showProject }: { task: TaskRow; running: boolean; showProject: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <Card task={task} running={running} showProject={showProject} />
    </div>
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
