"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatElapsed } from "@/lib/format";
import { discardTimer, resumeLast, stopTimer, updateTimerNote } from "@/server/actions";
import { useAction } from "./use-action";

export type TimerView = {
  startedAt: string;
  note: string;
  projectId: number;
  projectName: string;
  orgName: string;
  taskId: number | null;
  taskTitle: string | null;
} | null;

export function TimerBar({ timer }: { timer: TimerView }) {
  const { pending, exec } = useAction();
  const [now, setNow] = useState(() => Date.now());
  const [note, setNote] = useState(timer?.note ?? "");
  const [prevTimer, setPrevTimer] = useState(timer);

  // Reset the note field when a different timer starts.
  if (timer !== prevTimer) {
    setPrevTimer(timer);
    setNote(timer?.note ?? "");
  }

  useEffect(() => {
    if (!timer) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer]);

  useEffect(() => {
    const elapsed = timer ? formatElapsed((now - new Date(timer.startedAt).getTime()) / 1000) : null;
    document.title = elapsed ? `${elapsed} · ${timer!.taskTitle ?? timer!.projectName}` : "SoloOS";
  }, [now, timer]);

  // Alt+S: stop the running timer, or resume the last one.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.code === "KeyS") {
        e.preventDefault();
        if (timer) exec(stopTimer, "Time logged");
        else exec(resumeLast, "Timer resumed");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timer, exec]);

  if (!timer) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>No timer running</span>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => exec(resumeLast)}>
          <PlayIcon /> Resume last
        </Button>
      </div>
    );
  }

  const elapsed = (now - new Date(timer.startedAt).getTime()) / 1000;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-500" />
      <div className="min-w-0 text-sm">
        <Link
          href={`/projects/${timer.projectId}${timer.taskId ? `?task=${timer.taskId}` : ""}`}
          className="block truncate font-medium hover:underline"
        >
          {timer.taskTitle ?? timer.projectName}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {timer.orgName} · {timer.projectName}
        </div>
      </div>
      <Input
        value={note}
        placeholder="What are you working on?"
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== timer.note && exec(() => updateTimerNote(note))}
        className="h-7 max-w-64"
      />
      <span className="font-mono text-sm tabular-nums" suppressHydrationWarning>
        {formatElapsed(elapsed)}
      </span>
      <Button size="sm" disabled={pending} onClick={() => exec(stopTimer, "Time logged")}>
        <SquareIcon /> Stop
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        title="Discard timer"
        disabled={pending}
        onClick={() => confirm("Discard the running timer without logging time?") && exec(discardTimer)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
