"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { CheckIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMinutes, formatMoney, moneyInput, toDateString } from "@/lib/format";
import { CHANGE_REQUEST_STATUSES, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  baselineScope,
  deleteChangeRequest,
  deleteDecision,
  saveChangeRequest,
  saveDecision,
  setChangeRequestStatus,
  updateProjectScope,
} from "@/server/doc-actions";
import type { ChangeRequestRow, DecisionRow } from "@/server/doc-queries";
import { Field } from "./field";
import { Markdown } from "./markdown";
import { useAction } from "./use-action";
import { submitForm } from "./submit-form";

const signed = (min: number | null) => (min == null ? "" : `${min > 0 ? "+" : ""}${formatMinutes(min)} h`);
const signedMoney = (v: number | null, currency: string) =>
  v == null ? "" : `${v > 0 ? "+" : ""}${formatMoney(v, currency)}`;

export function ScopeEditor({
  projectId,
  scopeMd,
  baselinedAt,
}: {
  projectId: number;
  scopeMd: string;
  baselinedAt: Date | null;
}) {
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState(!scopeMd);
  const [value, setValue] = useState(scopeMd);
  return (
    <section className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Scope</h2>
        {baselinedAt ? (
          <Badge variant="secondary">Baselined {format(baselinedAt, "d MMM yyyy")}</Badge>
        ) : (
          <Badge variant="outline">Not agreed yet</Badge>
        )}
        <div className="ml-auto flex gap-1">
          {!editing && (
            <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          )}
          {!baselinedAt && scopeMd.trim() && (
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() =>
                confirm("Mark this scope as agreed with the client? Later changes become change requests.") &&
                exec(() => baselineScope(projectId), "Scope baselined")
              }
            >
              Mark as agreed
            </Button>
          )}
        </div>
      </div>
      <div className="p-3">
        {editing ? (
          <div className="grid gap-2">
            {baselinedAt && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                The scope is baselined: log changes as change requests below instead of editing it silently.
              </p>
            )}
            <Textarea
              aria-label="Scope"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-48 font-mono text-xs"
              placeholder={"In scope:\n- …\n\nOut of scope:\n- …"}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const res = await exec(() => updateProjectScope(projectId, value), "Saved");
                  if (res.ok) setEditing(false);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (setValue(scopeMd), setEditing(false))}>
                Cancel
              </Button>
            </div>
          </div>
        ) : scopeMd.trim() ? (
          <Markdown>{scopeMd}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No scope written yet.</p>
        )}
      </div>
    </section>
  );
}

function ChangeRequestForm({
  projectId,
  cr,
  currency,
  onDone,
}: {
  projectId: number;
  cr?: ChangeRequestRow;
  currency: string;
  onDone: () => void;
}) {
  const { pending, exec } = useAction();
  return (
    <form
      className="grid gap-2 border-b p-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveChangeRequest(cr?.id ?? null, fd), "Saved");
        if (res.ok) onDone();
      })}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <Field label="What changes">
        <Input name="title" required defaultValue={cr?.title} placeholder="e.g. Add a blog section" />
      </Field>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Requested by">
          <Input name="requestedBy" defaultValue={cr?.requestedBy ?? ""} />
        </Field>
        <Field label="Requested on">
          <Input name="requestedOn" type="date" defaultValue={cr?.requestedOn ?? toDateString(new Date())} />
        </Field>
        <Field label="Hours" hint="+6h, -1:30">
          <Input name="hoursImpact" defaultValue={cr?.hoursImpactMin != null ? signed(cr.hoursImpactMin).replace(" h", "") : ""} />
        </Field>
        <Field label={`Price (${currency})`} hint="negative = cheaper">
          <Input name="priceImpact" inputMode="decimal" defaultValue={moneyInput(cr?.priceImpact)} />
        </Field>
      </div>
      <Field label="Details">
        <Textarea name="detailsMd" defaultValue={cr?.detailsMd} className="min-h-20 text-sm" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {cr ? "Save" : "Add change request"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ChangeRequests({
  projectId,
  rows,
  currency,
}: {
  projectId: number;
  rows: ChangeRequestRow[];
  currency: string;
}) {
  const [editing, setEditing] = useState<ChangeRequestRow | "new" | null>(null);
  const { pending, exec } = useAction();
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Change requests</h2>
        <Button size="xs" variant="ghost" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </div>
      {editing && (
        <ChangeRequestForm
          key={editing === "new" ? "new" : editing.id}
          projectId={projectId}
          cr={editing === "new" ? undefined : editing}
          currency={currency}
          onDone={() => setEditing(null)}
        />
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No changes requested.</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((cr) => (
            <li key={cr.id} className="group grid gap-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("font-medium", cr.status === "rejected" && "text-muted-foreground line-through")}>
                  {cr.title}
                </span>
                <Badge variant={cr.status === "approved" ? "default" : cr.status === "rejected" ? "outline" : "secondary"}>
                  {labelOf(CHANGE_REQUEST_STATUSES, cr.status)}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {[signed(cr.hoursImpactMin), signedMoney(cr.priceImpact, currency)].filter(Boolean).join(" · ")}
                </span>
                <div className="ml-auto flex gap-0.5">
                  {cr.status !== "approved" && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={pending}
                      onClick={() => exec(() => setChangeRequestStatus(cr.id, "approved"), "Approved")}
                    >
                      <CheckIcon /> Approve
                    </Button>
                  )}
                  {cr.status !== "rejected" && (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => exec(() => setChangeRequestStatus(cr.id, "rejected"), "Rejected")}
                    >
                      <XIcon /> Reject
                    </Button>
                  )}
                  <span className="flex opacity-0 group-hover:opacity-100">
                    <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(cr)}>
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Delete"
                      onClick={() => confirm("Delete this change request?") && exec(() => deleteChangeRequest(cr.id))}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {format(parseISO(cr.requestedOn), "d MMM yyyy")}
                {cr.requestedBy && ` · ${cr.requestedBy}`}
                {cr.decidedOn && ` · ${cr.status} ${format(parseISO(cr.decidedOn), "d MMM")}`}
                {cr.sourceMessage && (
                  <>
                    {" · "}
                    <Link href={`/messages/${cr.sourceMessage.threadId}`} className="underline">
                      message
                    </Link>
                  </>
                )}
              </div>
              {cr.detailsMd && <Markdown className="text-muted-foreground">{cr.detailsMd}</Markdown>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DecisionLog({ projectId, rows }: { projectId: number; rows: DecisionRow[] }) {
  const [editing, setEditing] = useState<DecisionRow | "new" | null>(null);
  const { pending, exec } = useAction();
  const d = editing === "new" ? undefined : (editing ?? undefined);
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Decision log</h2>
        <Button size="xs" variant="ghost" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </div>
      {editing && (
        <form
          key={d?.id ?? "new"}
          className="grid gap-2 border-b p-3"
          onSubmit={submitForm(async (fd) => {
            const res = await exec(() => saveDecision(d?.id ?? null, fd), "Saved");
            if (res.ok) setEditing(null);
          })}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <Field label="Decision">
            <Input name="title" required defaultValue={d?.title} placeholder="e.g. Use Shopify instead of WooCommerce" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date">
              <Input name="decidedOn" type="date" defaultValue={d?.decidedOn ?? toDateString(new Date())} />
            </Field>
            <Field label="Who decided">
              <Input name="decidedBy" defaultValue={d?.decidedBy ?? ""} placeholder="Anna (client)" />
            </Field>
            <Field label="Source">
              <Input name="sourceNote" defaultValue={d?.sourceNote ?? ""} placeholder="call 3 Oct, email…" />
            </Field>
          </div>
          <Field label="Why / details">
            <Textarea name="detailsMd" defaultValue={d?.detailsMd} className="min-h-16 text-sm" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No decisions logged.</p>
      ) : (
        <ol className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="group grid gap-0.5 px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {format(parseISO(r.decidedOn), "d MMM yyyy")}
                </span>
                <span className="flex-1 font-medium">{r.title}</span>
                <span className="flex opacity-0 group-hover:opacity-100">
                  <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(r)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title="Delete"
                    onClick={() => confirm("Delete this decision?") && exec(() => deleteDecision(r.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              </div>
              {(r.decidedBy || r.sourceNote || r.sourceMessage) && (
                <div className="pl-22 text-xs text-muted-foreground">
                  {[r.decidedBy && `by ${r.decidedBy}`, r.sourceNote].filter(Boolean).join(" · ")}
                  {r.sourceMessage && (
                    <>
                      {" · "}
                      <Link href={`/messages/${r.sourceMessage.threadId}`} className="underline">
                        from message
                      </Link>
                    </>
                  )}
                </div>
              )}
              {r.detailsMd && (
                <details className="pl-22">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                  <Markdown className="mt-1">{r.detailsMd}</Markdown>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
