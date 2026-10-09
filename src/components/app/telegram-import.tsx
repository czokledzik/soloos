"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importTelegram, type TelegramSummary } from "@/server/message-actions";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

/** Upload result.json → assign chats to clients → import. */
export function TelegramImport({ orgs }: { orgs: { id: number; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const { pending, exec } = useAction();
  const [summary, setSummary] = useState<TelegramSummary | null>(null);
  const [assign, setAssign] = useState<Record<number, number>>({});
  const [meId, setMeId] = useState<string>("");

  const people = useMemo(() => {
    const all = new Map<string, string>();
    for (const c of summary?.chats ?? []) for (const p of c.participants) all.set(p.handle, p.name);
    return [...all].sort((a, b) => a[1].localeCompare(b[1]));
  }, [summary]);

  async function go(dryRun: boolean) {
    if (!form.current?.reportValidity()) return;
    const fd = new FormData(form.current);
    fd.set("dryRun", dryRun ? "1" : "0");
    if (meId) fd.set("meId", meId);
    fd.set("assign", JSON.stringify(Object.fromEntries(Object.entries(assign).filter(([, org]) => org > 0))));
    const res = await exec(() => importTelegram(fd), dryRun ? undefined : "Telegram import finished");
    if (!res.ok || !res.data) return;
    setSummary(res.data);
    if (dryRun) {
      setMeId(res.data.meId ?? "");
      setAssign(
        Object.fromEntries(res.data.chats.filter((c) => c.suggestedOrgId).map((c) => [c.id, c.suggestedOrgId!])),
      );
    }
  }

  const picked = Object.values(assign).filter(Boolean).length;

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium">Telegram chats</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Telegram Desktop → Settings → Advanced → <b>Export Telegram data</b> → Personal chats (and groups if needed), format{" "}
        <b>Machine-readable JSON</b>. Upload <code>result.json</code>, pick a client for each chat you want, import. Each chat
        becomes one thread; re-importing a newer export only adds new messages.
      </p>
      <form
        ref={form}
        className="grid gap-3"
        onSubmit={(e) => e.preventDefault()}
        onChange={(e) => (e.target as HTMLElement).getAttribute("name") === "file" && setSummary(null)}
      >
        <Field label="result.json">
          <Input name="file" type="file" accept=".json,application/json" required />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => go(true)}>
            Preview
          </Button>
          <Button type="button" disabled={pending || !summary || picked === 0} onClick={() => go(false)}>
            <UploadIcon /> Import {picked > 0 ? `${picked} chat${picked === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </form>

      {summary && (
        <div className="mt-4 grid gap-3 text-sm">
          {summary.imported && (
            <p className="rounded-lg bg-muted/50 p-3 font-medium">
              Imported {summary.imported.messages} messages
              {summary.imported.threads > 0 && ` in ${summary.imported.threads} new threads`}
              {summary.imported.duplicates > 0 && ` · ${summary.imported.duplicates} already there`}
            </p>
          )}
          {summary.errors.map((e) => (
            <p key={e} className="text-red-600">
              {e}
            </p>
          ))}
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
                {summary.chats.map((c) => (
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
                      {c.messages}
                      {c.alreadyImported > 0 && (
                        <div className="text-xs text-muted-foreground">{c.alreadyImported} imported</div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {format(new Date(c.from), "d MMM yyyy")} – {format(new Date(c.to), "d MMM yyyy")}
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
        </div>
      )}
    </section>
  );
}
