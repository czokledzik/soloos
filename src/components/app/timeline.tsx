"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  BriefcaseIcon,
  ScissorsIcon,
  PencilIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHANNEL_ICON } from "@/lib/channel-icons";
import { CHANNELS, DIRECTIONS, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { deleteInteraction } from "@/server/crm-actions";
import type { CrmPickers, InteractionRow } from "@/server/crm-queries";
import type { MessageView, ThreadView } from "@/server/message-queries";
import type { PickerData } from "@/server/queries";
import { InteractionForm } from "./crm-forms";
import { MessageList } from "./thread-view";
import { useAction } from "./use-action";

/** Non-interaction events shown between conversations (lead created, project started…). */
export type TimelineEvent = { key: string; at: Date; label: string; href?: string; kind: "lead" | "project" };

type ThreadDay = { thread: ThreadView; day: string; messages: MessageView[] };

type Item =
  | { type: "interaction"; at: Date; row: InteractionRow }
  | { type: "event"; at: Date; event: TimelineEvent }
  | { type: "thread"; at: Date; group: ThreadDay };

/** A thread shows up once per day it was active, so it interleaves with everything else by date. */
function threadDays(threads: ThreadView[]): ThreadDay[] {
  const out: ThreadDay[] = [];
  for (const thread of threads) {
    const byDay = new Map<string, MessageView[]>();
    for (const m of thread.messages) {
      const day = format(m.sentAt, "yyyy-MM-dd");
      byDay.set(day, [...(byDay.get(day) ?? []), m]);
    }
    for (const [day, messages] of byDay) out.push({ thread, day, messages });
  }
  return out;
}

export function Timeline({
  interactions,
  events = [],
  threads = [],
  crm,
  projects,
  showLinks = true,
}: {
  interactions: InteractionRow[];
  events?: TimelineEvent[];
  threads?: ThreadView[];
  crm: CrmPickers;
  projects: PickerData["projects"];
  showLinks?: boolean;
}) {
  const [editing, setEditing] = useState<InteractionRow | null>(null);
  const items: Item[] = [
    ...interactions.map((row) => ({ type: "interaction" as const, at: row.occurredAt, row })),
    ...events.map((event) => ({ type: "event" as const, at: event.at, event })),
    ...threadDays(threads).map((group) => ({ type: "thread" as const, at: group.messages.at(-1)!.sentAt, group })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No conversations logged yet.</p>;
  }

  return (
    <div className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
      {items.map((item) =>
        item.type === "interaction" ? (
          <InteractionItem key={`i${item.row.id}`} row={item.row} showLinks={showLinks} onEdit={() => setEditing(item.row)} />
        ) : item.type === "thread" ? (
          <ThreadDayItem key={`t${item.group.thread.id}-${item.group.day}`} group={item.group} />
        ) : (
          <EventItem key={item.event.key} event={item.event} />
        ),
      )}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit conversation</DialogTitle>
          </DialogHeader>
          {editing && (
            <InteractionForm
              key={editing.id}
              crm={crm}
              projects={projects}
              interaction={editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InteractionItem({ row, showLinks, onEdit }: { row: InteractionRow; showLinks: boolean; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { exec } = useAction();
  const Icon = CHANNEL_ICON[row.channel];
  const lines = row.bodyMd.split("\n");
  const long = lines.length > 8 || row.bodyMd.length > 600;
  const shown = expanded || !long ? row.bodyMd : lines.slice(0, 8).join("\n").slice(0, 600);

  return (
    <div className="group relative flex gap-3">
      <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{row.title || labelOf(CHANNELS, row.channel)}</span>
          <span>{format(row.occurredAt, "d MMM yyyy, HH:mm")}</span>
          {row.direction !== "both" && <span>· {labelOf(DIRECTIONS, row.direction)}</span>}
          {row.contact && <span>· {row.contact.name}</span>}
          {showLinks && row.opportunity && (
            <Link href={`/pipeline?opp=${row.opportunity.id}`} className="hover:underline">
              · {row.opportunity.title}
            </Link>
          )}
          {showLinks && row.project && row.project.name !== row.opportunity?.title && (
            <Link href={`/projects/${row.project.id}`} className="hover:underline">
              · {row.project.name}
            </Link>
          )}
          <div className="ml-auto flex opacity-0 group-hover:opacity-100">
            {row.bodyMd && (
              <Link
                href={`/messages/new?interaction=${row.id}`}
                title="Split into messages"
                className={buttonVariants({ size: "icon-xs", variant: "ghost" })}
              >
                <ScissorsIcon />
              </Link>
            )}
            <Button size="icon-xs" variant="ghost" title="Edit" onClick={onEdit}>
              <PencilIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Delete"
              onClick={() => confirm("Delete this conversation?") && exec(() => deleteInteraction(row.id), "Deleted")}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
        {row.bodyMd && (
          <div className={cn("mt-2 text-sm whitespace-pre-wrap break-words", !expanded && long && "text-foreground/90")}>
            {shown}
            {long && (
              <button
                type="button"
                className="mt-1 block text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadDayItem({ group: { thread, messages } }: { group: ThreadDay }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CHANNEL_ICON[thread.channel];
  const people = thread.participants.filter((p) => !p.isMe).map((p) => p.contactName ?? p.name);
  const shown = expanded ? messages : messages.slice(-6);
  return (
    <div className="relative flex gap-3">
      <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-background">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 rounded-xl border p-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <Link href={`/messages/${thread.id}`} className="font-medium text-foreground hover:underline">
            {thread.title || people.join(", ") || labelOf(CHANNELS, thread.channel)}
          </Link>
          <span>{labelOf(CHANNELS, thread.channel)}</span>
          {thread.title && people.length > 0 && <span>· {people.join(", ")}</span>}
          <span>
            · {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
        </div>
        {messages.length > shown.length && (
          <button
            type="button"
            className="mb-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            Show {messages.length - shown.length} earlier
          </button>
        )}
        <MessageList messages={shown} />
      </div>
    </div>
  );
}

function EventItem({ event }: { event: TimelineEvent }) {
  const Icon = event.kind === "lead" ? SparklesIcon : BriefcaseIcon;
  const label = event.href ? (
    <Link href={event.href} className="hover:underline">
      {event.label}
    </Link>
  ) : (
    event.label
  );
  return (
    <div className="relative flex items-center gap-3 text-xs text-muted-foreground">
      <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-3.5" />
      </div>
      <span>{label}</span>
      <span>· {format(event.at, "d MMM yyyy")}</span>
    </div>
  );
}
