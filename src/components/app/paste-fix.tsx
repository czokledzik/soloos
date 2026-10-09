"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addMinutes, format, parseISO } from "date-fns";
import { ArrowUpToLineIcon, PlusIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Interaction } from "@/db/schema";
import { CHANNELS } from "@/lib/labels";
import { ME, splitConversation, type SplitFormat } from "@/lib/paste-split";
import { cn } from "@/lib/utils";
import type { CrmPickers } from "@/server/crm-queries";
import { savePastedThread } from "@/server/message-actions";
import type { PickerData } from "@/server/queries";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

type Row = { key: number; sender: string; at: string; body: string };

const FORMAT_LABEL: Record<SplitFormat, string> = {
  whatsapp: "WhatsApp export",
  telegram: "Telegram copy",
  messenger: "Messenger copy",
  chat: "Chat log (Name: text)",
  none: "No format recognized: one message, split it by hand",
};

export type PasteFixDefaults = {
  orgId?: number;
  opportunityId?: number;
  projectId?: number;
  channel?: Interaction["channel"];
  title?: string;
  text?: string;
  date?: string;
  interactionId?: number;
  /** Appending to an existing thread: client/lead/project come from it. */
  thread?: { id: number; title: string; orgName: string; senders: string[]; me: string | null };
};

let nextKey = 1;

/** Fills in missing times so messages keep their order: one minute after the previous one. */
function withTimes(rows: { sender: string; at: string | null; body: string }[], fallbackDate: string): Row[] {
  let prev = parseISO(`${fallbackDate}T12:00`);
  return rows.map((r) => {
    const at = r.at ? parseISO(r.at) : addMinutes(prev, 1);
    prev = at;
    return { key: nextKey++, sender: r.sender, at: format(at, "yyyy-MM-dd'T'HH:mm"), body: r.body };
  });
}

export function PasteFix({
  crm,
  projects,
  defaults,
}: {
  crm: CrmPickers;
  projects: PickerData["projects"];
  defaults: PasteFixDefaults;
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const [orgId, setOrgId] = useState<number | null>(defaults.orgId ?? null);
  const [opportunityId, setOpportunityId] = useState<number | null>(defaults.opportunityId ?? null);
  const [projectId, setProjectId] = useState<number | null>(defaults.projectId ?? null);
  const [channel, setChannel] = useState<Interaction["channel"]>(defaults.channel ?? "facebook");
  const [title, setTitle] = useState(defaults.title ?? "");
  const [text, setText] = useState(defaults.text ?? "");
  const [date, setDate] = useState(defaults.date ?? format(new Date(), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [detected, setDetected] = useState<SplitFormat | null>(null);
  const [me, setMe] = useState<string>(defaults.thread?.me ?? "");

  const senders = useMemo(() => {
    const fromRows = rows?.map((r) => r.sender.trim()).filter(Boolean) ?? [];
    return [...new Set([...(defaults.thread?.senders ?? []), ...fromRows])];
  }, [rows, defaults.thread]);

  function split() {
    const res = splitConversation(text, date);
    setRows(withTimes(res.messages, date));
    setDetected(res.format);
    if (!me) setMe(res.senders.find((s) => s === ME || /^(me|ja|you)$/i.test(s)) ?? "");
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((rs) => rs!.filter((r) => r.key !== key));
  const mergeUp = (i: number) =>
    setRows((rs) => {
      const next = [...rs!];
      next[i - 1] = { ...next[i - 1], body: `${next[i - 1].body}\n${next[i].body}` };
      next.splice(i, 1);
      return next;
    });
  /** Splits a message at the cursor into two. */
  const splitAt = (i: number, pos: number) =>
    setRows((rs) => {
      const r = rs![i];
      const before = r.body.slice(0, pos).trimEnd();
      const after = r.body.slice(pos).trimStart();
      if (!before || !after) return rs;
      const next = [...rs!];
      next.splice(i, 1, { ...r, body: before }, { ...r, key: nextKey++, body: after });
      return next;
    });
  const add = () =>
    setRows((rs) => {
      const last = rs?.at(-1);
      const at = last ? format(addMinutes(parseISO(last.at), 1), "yyyy-MM-dd'T'HH:mm") : `${date}T12:00`;
      return [...(rs ?? []), { key: nextKey++, sender: me || "", at, body: "" }];
    });
  /** Rename a sender everywhere (e.g. "You sent" → "Me", or a nickname → full name). */
  const rename = (from: string, to: string) => {
    setRows((rs) => rs!.map((r) => (r.sender.trim() === from ? { ...r, sender: to } : r)));
    if (me === from) setMe(to);
  };

  async function save() {
    if (!rows) return;
    if (!defaults.thread && !orgId) return void alert("Pick a client first");
    const res = await exec(
      () =>
        savePastedThread({
          threadId: defaults.thread?.id,
          orgId: orgId ?? 0,
          opportunityId,
          projectId,
          channel,
          title,
          me: me || null,
          interactionId: defaults.interactionId,
          messages: rows.map(({ sender, at, body }) => ({ sender: sender.trim(), at, body })),
        }),
      "Messages saved",
    );
    if (res.ok && res.data) router.push(`/messages/${res.data}`);
  }

  const orgOpps = crm.opportunities.filter((o) => o.orgId === orgId);
  const orgProjects = projects.filter((p) => p.orgId === orgId);
  const orgName = (id: number) => crm.orgs.find((o) => o.id === id)?.name;

  return (
    <div className="grid gap-5">
      {defaults.thread ? (
        <p className="text-sm text-muted-foreground">
          Adding messages to <b className="text-foreground">{defaults.thread.title || "thread"}</b> ({defaults.thread.orgName}).
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Client">
            <NativeSelect
              value={orgId ?? ""}
              onChange={(e) => {
                setOrgId(e.target.value ? Number(e.target.value) : null);
                setOpportunityId(null);
                setProjectId(null);
              }}
            >
              <option value="">Select…</option>
              {crm.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Lead">
            <NativeSelect value={opportunityId ?? ""} onChange={(e) => setOpportunityId(Number(e.target.value) || null)}>
              <option value="">—</option>
              {orgOpps.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Project">
            <NativeSelect value={projectId ?? ""} onChange={(e) => setProjectId(Number(e.target.value) || null)}>
              <option value="">—</option>
              {orgProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Channel">
            <NativeSelect value={channel} onChange={(e) => setChannel(e.target.value as Interaction["channel"])}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Thread title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={orgId ? `e.g. Messenger with ${orgName(orgId)}` : ""}
            />
          </Field>
        </div>
      )}

      <div className="grid gap-3">
        <Field
          label="Pasted conversation"
          hint="WhatsApp exports, Telegram and Messenger copies and “Name: text” logs are split automatically. Anything else becomes one message you can split by hand."
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-40 font-mono text-xs"
            placeholder={"Anna Nowak, [05.10.2026 14:32]\nCześć! …"}
          />
        </Field>
        <div className="flex items-end gap-3">
          <Field label="Date for messages without one" className="w-52">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button type="button" variant={rows ? "outline" : "default"} disabled={!text.trim()} onClick={split}>
            <ScissorsIcon /> {rows ? "Split again" : "Split into messages"}
          </Button>
        </div>
      </div>

      {rows && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground">
              {detected && FORMAT_LABEL[detected]} · {rows.length} message{rows.length === 1 ? "" : "s"}
            </span>
            <Field label="Which sender is you?" className="w-56">
              <NativeSelect value={me} onChange={(e) => setMe(e.target.value)}>
                <option value="">Nobody / not sure</option>
                {senders.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {senders.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="self-center text-muted-foreground">Rename:</span>
              {senders.map((s) => (
                <RenameChip key={s} name={s} onRename={(to) => rename(s, to)} />
              ))}
            </div>
          )}

          <datalist id="paste-senders">
            {senders.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <ol className="grid gap-2">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className={cn(
                  "grid gap-2 rounded-xl border p-2 sm:grid-cols-[11rem_11rem_minmax(0,1fr)_auto]",
                  r.sender && r.sender === me && "bg-primary/5",
                )}
              >
                <Input
                  aria-label="Sender"
                  list="paste-senders"
                  value={r.sender}
                  placeholder="Sender"
                  onChange={(e) => update(r.key, { sender: e.target.value })}
                  className="h-8"
                />
                <Input
                  aria-label="Sent at"
                  type="datetime-local"
                  value={r.at}
                  required
                  onChange={(e) => update(r.key, { at: e.target.value })}
                  className="h-8"
                />
                <Textarea
                  aria-label="Message"
                  value={r.body}
                  onChange={(e) => update(r.key, { body: e.target.value })}
                  onKeyDown={(e) => {
                    // Ctrl/⌘+Enter splits the message at the cursor.
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      splitAt(i, e.currentTarget.selectionStart);
                    }
                  }}
                  className="min-h-9 text-sm"
                  rows={Math.min(8, r.body.split("\n").length)}
                />
                <div className="flex items-start gap-0.5">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="Merge into the message above"
                    disabled={i === 0}
                    onClick={() => mergeUp(i)}
                  >
                    <ArrowUpToLineIcon />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" title="Delete" onClick={() => remove(r.key)}>
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Tip: put the cursor inside a message and press Ctrl/⌘+Enter to split it there.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={add}>
              <PlusIcon /> Add message
            </Button>
            <Button type="button" disabled={pending || rows.length === 0} onClick={save} className="ml-auto">
              Save {rows.length} message{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function RenameChip({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  return (
    <button
      type="button"
      className="rounded-md border px-2 py-0.5 hover:bg-muted"
      onClick={() => {
        const to = prompt(`Rename “${name}” to:`, name)?.trim();
        if (to && to !== name) onRename(to);
      }}
    >
      {name}
    </button>
  );
}
