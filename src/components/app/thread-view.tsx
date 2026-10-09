"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isSameDay } from "date-fns";
import { ClipboardPasteIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CHANNELS } from "@/lib/labels";
import { linkify } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import type { CrmPickers } from "@/server/crm-queries";
import {
  deleteMessage,
  deleteThread,
  updateMessage,
  updateParticipant,
  updateThread,
} from "@/server/message-actions";
import type { MessageView, ThreadView } from "@/server/message-queries";
import type { PickerData } from "@/server/queries";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

/** Chat bubbles: mine on the right, theirs on the left, with day separators. */
export function MessageList({ messages, editable = false }: { messages: MessageView[]; editable?: boolean }) {
  return (
    <div className="grid gap-1.5">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || !isSameDay(prev.sentAt, m.sentAt);
        const showSender = newDay || prev.sender !== m.sender;
        return (
          <div key={m.id} className="grid gap-1.5">
            {newDay && (
              <div className="py-1 text-center text-xs text-muted-foreground">{format(m.sentAt, "EEEE, d MMMM yyyy")}</div>
            )}
            <Bubble message={m} showSender={showSender} editable={editable} />
          </div>
        );
      })}
    </div>
  );
}

function Bubble({ message: m, showSender, editable }: { message: MessageView; showSender: boolean; editable: boolean }) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(m.bodyMd);
  return (
    <div className={cn("group flex flex-col", m.isMe ? "items-end" : "items-start")}>
      {showSender && <span className="px-1 text-xs text-muted-foreground">{m.sender || "Unknown"}</span>}
      <div className={cn("flex max-w-[85%] items-end gap-1", m.isMe && "flex-row-reverse")}>
        {editing ? (
          <div className="grid w-[32rem] max-w-full gap-1">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="text-sm" autoFocus />
            <div className="flex justify-end gap-1">
              <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={async () => {
                  const res = await exec(() => updateMessage(m.id, body));
                  if (res.ok) setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
              m.isMe ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {linkify(m.bodyMd).map((part, i) =>
              part.href ? (
                <a key={i} href={part.href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {part.text}
                </a>
              ) : (
                part.text
              ),
            )}
          </div>
        )}
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{format(m.sentAt, "HH:mm")}</span>
        {editable && !editing && (
          <span className="flex opacity-0 group-hover:opacity-100">
            <Button size="icon-xs" variant="ghost" title="Edit message" onClick={() => setEditing(true)}>
              <PencilIcon />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              title="Delete message"
              onClick={() => confirm("Delete this message?") && exec(() => deleteMessage(m.id), "Deleted")}
            >
              <Trash2Icon />
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

/** Full thread page: messages, who's who, and where the thread belongs. */
export function ThreadEditor({
  thread,
  crm,
  projects,
  contacts,
}: {
  thread: ThreadView;
  crm: CrmPickers;
  projects: PickerData["projects"];
  contacts: CrmPickers["contacts"];
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const [orgId, setOrgId] = useState(thread.orgId);
  const orgContacts = contacts.filter((c) => c.orgId === thread.orgId);
  const otherContacts = contacts.filter((c) => c.orgId !== thread.orgId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="min-w-0 rounded-xl border p-4">
        {thread.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages.</p>
        ) : (
          <MessageList messages={thread.messages} editable />
        )}
        <div className="mt-4 flex justify-end">
          <Link href={`/messages/new?thread=${thread.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ClipboardPasteIcon /> Paste more messages
          </Link>
        </div>
      </section>

      <aside className="grid content-start gap-4">
        <section className="rounded-xl border">
          <h2 className="border-b px-3 py-2 text-sm font-medium">People</h2>
          <div className="grid gap-3 p-3">
            {thread.participants.map((p) => (
              <div key={p.id} className="grid gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium" title={p.handle ?? undefined}>
                    {p.name}
                  </span>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={p.isMe}
                      onChange={(e) => exec(() => updateParticipant(p.id, { isMe: e.target.checked }))}
                    />
                    me
                  </label>
                </div>
                {!p.isMe && (
                  <NativeSelect
                    aria-label={`Contact for ${p.name}`}
                    value={p.contactId ?? ""}
                    onChange={(e) =>
                      exec(() => updateParticipant(p.id, { contactId: Number(e.target.value) || null }), "Saved")
                    }
                  >
                    <option value="">Not linked to a contact</option>
                    <optgroup label={thread.orgName}>
                      {orgContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    {otherContacts.length > 0 && (
                      <optgroup label="Other clients (collaborators)">
                        {otherContacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </NativeSelect>
                )}
              </div>
            ))}
            {thread.participants.length === 0 && <p className="text-sm text-muted-foreground">Nobody named.</p>}
          </div>
        </section>

        <section className="rounded-xl border">
          <h2 className="border-b px-3 py-2 text-sm font-medium">Thread</h2>
          <form
            className="grid gap-3 p-3"
            action={async (fd) => {
              await exec(() => updateThread(thread.id, fd), "Saved");
            }}
            key={`${thread.orgId}-${thread.opportunityId}-${thread.projectId}`}
          >
            <Field label="Title">
              <Input name="title" defaultValue={thread.title} />
            </Field>
            <Field label="Client">
              <NativeSelect name="orgId" value={orgId} onChange={(e) => setOrgId(Number(e.target.value))}>
                {crm.orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Lead">
              <NativeSelect name="opportunityId" defaultValue={thread.opportunityId ?? ""} key={`o${orgId}`}>
                <option value="">—</option>
                {crm.opportunities
                  .filter((o) => o.orgId === orgId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Project">
              <NativeSelect name="projectId" defaultValue={thread.projectId ?? ""} key={`p${orgId}`}>
                <option value="">—</option>
                {projects
                  .filter((p) => p.orgId === orgId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            <Field label="Channel">
              <NativeSelect name="channel" defaultValue={thread.channel}>
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                disabled={pending}
                onClick={async () => {
                  if (!confirm(`Delete this thread and its ${thread.messages.length} messages?`)) return;
                  const res = await exec(() => deleteThread(thread.id), "Thread deleted");
                  if (res.ok) router.push(`/clients/${thread.orgId}`);
                }}
              >
                Delete thread
              </Button>
            </div>
          </form>
        </section>
      </aside>
    </div>
  );
}
