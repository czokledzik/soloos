"use client";

import * as React from "react";
import { PlayIcon, PlusIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startTimer, stopTimer } from "@/server/actions";
import { openGlobalDialog } from "./global-dialogs";
import { useAction } from "./use-action";

export function OpenDialogButton({
  kind,
  opts,
  children,
  variant = "default",
  size = "sm",
}: {
  kind: Parameters<typeof openGlobalDialog>[0];
  opts?: Parameters<typeof openGlobalDialog>[1];
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  return (
    <Button variant={variant} size={size} onClick={() => openGlobalDialog(kind, opts)}>
      <PlusIcon /> {children}
    </Button>
  );
}

/** Start (or stop, if it's the one running) a timer on a project/task. */
export function TimerButton({
  projectId,
  taskId = null,
  running = false,
  label,
  size = "icon-sm",
  variant = "ghost",
}: {
  projectId: number;
  taskId?: number | null;
  running?: boolean;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { pending, exec } = useAction();
  return (
    <Button
      size={size}
      variant={running ? "default" : variant}
      disabled={pending}
      title={running ? "Stop timer" : "Start timer"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (running) exec(stopTimer, "Time logged");
        else exec(() => startTimer(projectId, taskId), "Timer started");
      }}
    >
      {running ? <SquareIcon /> : <PlayIcon />}
      {label}
    </Button>
  );
}
