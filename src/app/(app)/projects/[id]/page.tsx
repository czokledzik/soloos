import Link from "next/link";
import { TaskBoard } from "@/components/app/task-board";
import { TaskList } from "@/components/app/task-list";
import { TaskSheet } from "@/components/app/task-sheet";
import { cn } from "@/lib/utils";
import { getPickerData, getRunningTimer, getTask, listProjectTasks } from "@/server/queries";

export default async function ProjectTasksPage({ params, searchParams }: PageProps<"/projects/[id]">) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const taskId = Number(sp.task);
  const [tasks, timer, pickers, openTask] = await Promise.all([
    listProjectTasks(id),
    getRunningTimer(),
    getPickerData(),
    Number.isInteger(taskId) ? getTask(taskId) : null,
  ]);
  const runningTaskId = timer?.taskId ?? null;

  return (
    <div>
      <div className="flex gap-1 px-6 pb-3 text-sm">
        {(["board", "list"] as const).map((v) => (
          <Link
            key={v}
            href={`/projects/${id}${v === "list" ? "?view=list" : ""}`}
            className={cn(
              "rounded-md px-2 py-0.5 capitalize",
              view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </Link>
        ))}
      </div>
      {view === "board" ? (
        <TaskBoard tasks={tasks} projectId={id} runningTaskId={runningTaskId} />
      ) : (
        <TaskList tasks={tasks} runningTaskId={runningTaskId} />
      )}
      <TaskSheet task={openTask} projects={pickers.projects} running={openTask != null && runningTaskId === openTask.id} />
    </div>
  );
}
