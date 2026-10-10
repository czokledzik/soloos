"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTelegramExport, type TelegramExport } from "@/lib/telegram";
import {
  finishTelegramImport,
  importTelegramChunk,
  telegramPreview,
  type TelegramPreview,
} from "@/server/message-actions";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

const CHUNK = 1000;

/**
 * result.json → assign chats to clients → import. The file is read in the
 * browser (full exports are huge); only the chosen chats go to the server, in chunks.
 */
export function TelegramImport({ orgs }: { orgs: { id: number; name: string }[] }) {
  const { pending, exec } = useAction();
  const [data, setData] = useState<TelegramExport | null>(null);
  const [preview, setPreview] = useState<TelegramPreview>({});
  const [assign, setAssign] = useState<Record<number, number>>({});
  const [meId, setMeId] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ messages: number; threads: number; duplicates: number } | null>(null);

  const people = useMemo(() => {
    const all = new Map<string, string>();
    for (const c of data?.chats ?? []) for (const p of c.participants) all.set(p.handle, p.name);
    return [...all].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  async function load(file: File | undefined) {
    setData(null);
    setSummary(null);
    if (!file) return;
    setProgress("Reading the file…");
    const parsed = parseTelegramExport(await file.text());
    parsed.chats.sort((a, b) => b.messages.at(-1)!.sentAt.getTime() - a.messages.at(-1)!.sentAt.getTime());
    const me = parsed.meId ?? "";
    setMeId(me);
    setData(parsed);
    setProgress(null);
    if (!parsed.chats.length) return;
    const res = await exec(() =>
      telegramPreview(
        parsed.chats.map((c) => ({ id: c.id, participants: c.participants.map(({ handle, name }) => ({ handle, name })) })),
        me || null,
      ),
    );
    if (res.ok && res.data) {
      setPreview(res.data);
      setAssign(
        Object.fromEntries(
          Object.entries(res.data)
            .filter(([, v]) => v.suggestedOrgId)
            .map(([id, v]) => [Number(id), v.suggestedOrgId!]),
        ),
      );
    }
  }

  async function run() {
    if (!data) return;
    const chosen = data.chats.filter((c) => assign[c.id] > 0);
    const total = { messages: 0, threads: 0, duplicates: 0 };
    for (const [n, c] of chosen.entries()) {
      for (let i = 0; i < c.messages.length; i += CHUNK) {
        setProgress(`Importing ${c.name} (${n + 1}/${chosen.length}): ${Math.min(i + CHUNK, c.messages.length)} of ${c.messages.length}`);
        const res = await exec(() =>
          importTelegramChunk({
            chatId: c.id,
            chatName: c.name,
            orgId: assign[c.id],
            meId: meId || null,
            participants: c.participants.map(({ handle, name }) => ({ handle, name })),
            messages: c.messages.slice(i, i + CHUNK).map((m) => ({ id: m.id, fromId: m.fromId, sentAt: m.sentAt.toISOString(), body: m.body })),
          }),
        );
        if (!res.ok || !res.data) {
          setProgress(null);
          return;
        }
        if (res.data.created) total.threads++;
        total.messages += res.data.added;
        total.duplicates += res.data.duplicates;
      }
    }
    await exec(finishTelegramImport, "Telegram import finished");
    setProgress(null);
    setSummary(total);
  }

  const picked = Object.values(assign).filter((v) => v > 0).length;
  const busy = pending || progress != null;

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">Telegram chats</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Telegram Desktop → Settings → Advanced → <b>Export Telegram data</b> → Personal chats (and groups if needed), format{" "}
        <b>Machine-readable JSON</b>. Pick <code>result.json</code>, choose a client for each chat you want, import. Each chat
        becomes one thread; importing a newer export later only adds new messages.
      </p>
      <div className="grid gap-3">
        <Field label="result.json">
          <Input type="file" accept=".json,application/json" onChange={(e) => load(e.target.files?.[0])} />
        </Field>
        <div>
          <Button type="button" disabled={busy || !data || picked === 0} onClick={run}>
            <UploadIcon /> Import {picked > 0 ? `${picked} chat${picked === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
        {progress && <p className="animate-pulse text-sm text-muted-foreground">{progress}</p>}
      </div>

      {data && (
        <div className="mt-4 grid gap-3 text-sm">
          {summary && (
            <p className="rounded-lg bg-muted/50 p-3 font-medium">
              Imported {summary.messages} messages
              {summary.threads > 0 && ` in ${summary.threads} new threads`}
              {summary.duplicates > 0 && ` · ${summary.duplicates} already there`}
            </p>
          )}
          {data.errors.map((e) => (
            <p key={e} className="text-red-600">
              {e}
            </p>
          ))}
          {data.chats.length > 0 && (
            <>
              <Field label="You are" className="w-64">
                <NativeSelect value={meId} onChange={(e) => setMeId(e.target.value)}>
                  <option value="">Not sure</option>
                  {people.map(([handle, name]) => (
                    <option key={handle} value={handle}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Chat</th>
                      <th className="px-3 py-2 text-right font-medium">Messages</th>
                      <th className="px-3 py-2 font-medium">Period</th>
                      <th className="px-3 py-2 font-medium">Client</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.chats.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.participants
                              .filter((p) => p.handle !== meId)
                              .map((p) => p.name)
                              .join(", ")}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {c.messages.length}
                          {(preview[c.id]?.alreadyImported ?? 0) > 0 && (
                            <div className="text-xs text-muted-foreground">{preview[c.id].alreadyImported} imported</div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {format(c.messages[0].sentAt, "d MMM yyyy")} – {format(c.messages.at(-1)!.sentAt, "d MMM yyyy")}
                        </td>
                        <td className="px-3 py-1.5">
                          <NativeSelect
                            aria-label={`Client for ${c.name}`}
                            value={assign[c.id] ?? ""}
                            onChange={(e) => setAssign((a) => ({ ...a, [c.id]: Number(e.target.value) || 0 }))}
                          >
                            <option value="">Skip</option>
                            {orgs.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
