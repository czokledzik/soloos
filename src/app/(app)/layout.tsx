import { CommandPalette } from "@/components/app/command-palette";
import { GlobalDialogs } from "@/components/app/global-dialogs";
import { Sidebar } from "@/components/app/sidebar";
import { TimerBar, type TimerView } from "@/components/app/timer-bar";
import { getCrmPickers } from "@/server/crm-queries";
import { getPickerData, getRunningTimer } from "@/server/queries";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [timer, pickers, crm] = await Promise.all([getRunningTimer(), getPickerData(), getCrmPickers()]);

  const timerView: TimerView = timer && {
    startedAt: timer.startedAt.toISOString(),
    note: timer.note,
    projectId: timer.projectId,
    projectName: timer.project.name,
    orgName: timer.project.org.name,
    taskId: timer.taskId,
    taskTitle: timer.task?.title ?? null,
  };

  return (
    <div className="flex h-full">
      <Sidebar canLogout={Boolean(process.env.APP_PASSWORD)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
          <TimerBar timer={timerView} />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette data={pickers} crm={crm} timerRunning={timer != null} />
      <GlobalDialogs pickers={pickers} crm={crm} />
    </div>
  );
}
