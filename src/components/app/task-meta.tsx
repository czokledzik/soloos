import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  EyeIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
} from "lucide-react";
import { isBefore, parseISO, startOfToday } from "date-fns";
import type { TaskStatus } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const Icon = {
    backlog: CircleDashedIcon,
    todo: CircleIcon,
    in_progress: CircleDotIcon,
    review: EyeIcon,
    done: CircleCheckIcon,
  }[status];
  const color = {
    backlog: "text-muted-foreground",
    todo: "text-foreground/70",
    in_progress: "text-amber-500",
    review: "text-violet-500",
    done: "text-emerald-500",
  }[status];
  return <Icon className={cn("size-4 shrink-0", color, className)} />;
}

export function PriorityIcon({ priority }: { priority: number }) {
  if (!priority) return null;
  const Icon = [null, SignalLowIcon, SignalMediumIcon, SignalHighIcon][priority]!;
  return <Icon className={cn("size-4 shrink-0", priority === 3 ? "text-red-500" : "text-muted-foreground")} />;
}

export function DueDate({ date, done }: { date: string | null; done?: boolean }) {
  if (!date) return null;
  const overdue = !done && isBefore(parseISO(date), startOfToday());
  return (
    <span className={cn("text-xs tabular-nums", overdue ? "font-medium text-red-500" : "text-muted-foreground")}>
      {formatDate(date, "d MMM")}
    </span>
  );
}
