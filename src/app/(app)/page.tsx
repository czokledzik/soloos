import Link from "next/link";
import { addDays, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { EntriesList } from "@/components/app/entries-list";
import { Empty, PageHeader, Stat } from "@/components/app/page-header";
import { TaskList } from "@/components/app/task-list";
import { TaskSheet } from "@/components/app/task-sheet";
import { OpenDialogButton } from "@/components/app/buttons";
import { formatDate, formatHours, formatMinutes, relativeDay, toDateString } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listFollowUps } from "@/server/crm-queries";
import {
  getPickerData,
  getRunningTimer,
  getTask,
  listOpenTasks,
  listTimeEntries,
  minutesByClient,
} from "@/server/queries";

export const metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const taskId = Number(sp.task);

  const [todayEntries, weekByClient, monthByClient, openTasks, timer, pickers, openTask, followUps] = await Promise.all([
    listTimeEntries({ from: dayStart, to: addDays(dayStart, 1) }),
    minutesByClient(weekStart, addDays(weekStart, 7)),
    minutesByClient(monthStart, addDays(now, 1)),
    listOpenTasks(),
    getRunningTimer(),
    getPickerData(),
    Number.isInteger(taskId) ? getTask(taskId) : null,
    listFollowUps(),
  ]);

  const today = toDateString(now);
  const soon = toDateString(addDays(now, 3));
  const focus = openTasks.filter(
    (t) => t.status === "in_progress" || t.status === "review" || (t.dueDate != null && t.dueDate <= soon),
  );
  const todayMin = todayEntries.reduce((s, e) => s + e.durationMin, 0);
  const weekMin = weekByClient.reduce((s, r) => s + r.minutes, 0);
  const weekBillable = weekByClient.reduce((s, r) => s + r.billableMin, 0);
  const monthMin = monthByClient.reduce((s, r) => s + r.minutes, 0);
  const overdue = openTasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const runningTaskId = timer?.taskId ?? null;

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle={formatDate(now, "EEEE, d MMMM")}
        actions={
          <>
            <OpenDialogButton kind="interaction" variant="outline">
              Log conversation
            </OpenDialogButton>
            <OpenDialogButton kind="lead" variant="outline">
              Add lead
            </OpenDialogButton>
          </>
        }
      />
      <div className="grid gap-6 px-6 pb-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Today" value={formatMinutes(todayMin)} />
          <Stat label="This week" value={formatMinutes(weekMin)} sub={`${formatMinutes(weekBillable)} billable`} />
          <Stat label="This month" value={formatHours(monthMin)} />
          <Stat label="Open tasks" value={openTasks.length} sub={overdue ? `${overdue} overdue` : "none overdue"} />
        </div>

        {followUps.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium">
              Follow-ups due <span className="font-normal text-muted-foreground">{followUps.length}</span>
            </h2>
            <div className="divide-y rounded-xl border">
              {followUps.map((f) => (
                <Link
                  key={f.id}
                  href={`/pipeline?opp=${f.id}`}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/30"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{f.nextAction || "Follow up"}</span>
                    <span className="text-muted-foreground"> · {f.title}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{f.orgName}</span>
                  <span
                    className={cn(
                      "w-20 text-right text-xs",
                      f.nextActionAt! < today ? "font-medium text-red-500" : "text-amber-600",
                    )}
                  >
                    {relativeDay(f.nextActionAt!)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section>
            <h2 className="mb-2 text-sm font-medium">Focus</h2>
            {focus.length ? (
              <div className="-mx-6">
                <TaskList tasks={focus} runningTaskId={runningTaskId} showProject />
              </div>
            ) : (
              <Empty>No tasks in progress or due in the next 3 days.</Empty>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">This week by client</h2>
            {weekByClient.length ? (
              <div className="grid gap-2 rounded-xl border p-3">
                {weekByClient.map((r) => (
                  <div key={r.orgId} className="grid gap-1 text-sm">
                    <div className="flex justify-between">
                      <span className="truncate">{r.orgName}</span>
                      <span className="font-mono tabular-nums">{formatMinutes(r.minutes)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(r.minutes / weekMin) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>No time tracked this week.</Empty>
            )}
          </section>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-medium">Logged today</h2>
          {todayEntries.length ? (
            <EntriesList entries={todayEntries} pickers={pickers} />
          ) : (
            <Empty>Nothing logged yet today. Start a timer from any task, or press ⌘K.</Empty>
          )}
        </section>
      </div>
      <TaskSheet task={openTask} projects={pickers.projects} running={openTask != null && runningTaskId === openTask.id} />
    </div>
  );
}
