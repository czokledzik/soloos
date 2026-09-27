import Link from "next/link";
import { OpenDialogButton } from "@/components/app/buttons";
import { Empty, PageHeader } from "@/components/app/page-header";
import { TaskBoard } from "@/components/app/task-board";
import { TaskList } from "@/components/app/task-list";
import { TaskSheet } from "@/components/app/task-sheet";
import { cn } from "@/lib/utils";
import { getPickerData, getRunningTimer, getTask, listOpenTasks } from "@/server/queries";

export const metadata = { title: "My work" };

export default async function MyWorkPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "list";
  const taskId = Number(sp.task);
  const [tasks, timer, pickers, openTask] = await Promise.all([
    listOpenTasks(),
    getRunningTimer(),
    getPickerData(),
    Number.isInteger(taskId) ? getTask(taskId) : null,
  ]);
  const runningTaskId = timer?.taskId ?? null;

  return (
    <div>
      <PageHeader
        title="My work"
        subtitle="Open tasks across all projects"
        actions={<OpenDialogButton kind="task">New task</OpenDialogButton>}
      />
      <div className="flex gap-1 px-6 pb-3 text-sm">
        {(["list", "board"] as const).map((v) => (
          <Link
            key={v}
            href={v === "board" ? "/tasks?view=board" : "/tasks"}
            className={cn(
              "rounded-md px-2 py-0.5 capitalize",
              view === v ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v}
          </Link>
        ))}
      </div>
      {tasks.length === 0 ? (
        <div className="px-6">
          <Empty>Nothing open. Enjoy it, or create a task.</Empty>
        </div>
      ) : view === "board" ? (
        <TaskBoard tasks={tasks} runningTaskId={runningTaskId} showProject />
      ) : (
        <TaskList tasks={tasks} runningTaskId={runningTaskId} showProject />
      )}
      <TaskSheet task={openTask} projects={pickers.projects} running={openTask != null && runningTaskId === openTask.id} />
    </div>
  );
}
