"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArchiveRestoreIcon, CheckIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toDateString } from "@/lib/format";
import { OPEN_QUESTION_STATUSES, RULE_KINDS, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  answerOpenQuestion,
  deleteBusinessRule,
  deleteOpenQuestion,
  saveBusinessRule,
  saveOpenQuestion,
  setBusinessRuleRetired,
  setOpenQuestionStatus,
} from "@/server/doc-actions";
import type { BusinessRuleRow, DecisionRow, OpenQuestionRow } from "@/server/doc-queries";
import { Field } from "./field";
import { Markdown } from "./markdown";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";
import { submitForm } from "./submit-form";

const day = (d: string) => format(parseISO(d), "d MMM yyyy");

function FormButtons({ pending, label, onCancel }: { pending: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={pending}>
        {label}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

// ---------- Open questions ----------

function QuestionForm({ projectId, q, onDone }: { projectId: number; q?: OpenQuestionRow; onDone: () => void }) {
  const { pending, exec } = useAction();
  return (
    <form
      className="grid gap-2 border-b p-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveOpenQuestion(q?.id ?? null, fd), "Saved");
        if (res.ok) onDone();
      })}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Field label="Code">
          <Input name="code" defaultValue={q?.code} placeholder="auto" />
        </Field>
        <Field label="Question">
          <Input name="question" required defaultValue={q?.question} placeholder="e.g. How long do we keep call recordings?" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Who answers">
          <Input name="owner" defaultValue={q?.owner ?? ""} placeholder="Anna (client)" />
        </Field>
        <Field label="Where in docs">
          <Input name="whereInDocs" defaultValue={q?.whereInDocs ?? ""} placeholder="2. Flow, diagram 3" />
        </Field>
        <Field label="Asked on">
          <Input name="askedOn" type="date" defaultValue={q?.askedOn ?? toDateString(new Date())} />
        </Field>
        <Field label="Needed by">
          <Input name="dueDate" type="date" defaultValue={q?.dueDate ?? ""} />
        </Field>
      </div>
      <Field label="Context">
        <Textarea name="detailsMd" defaultValue={q?.detailsMd} className="min-h-16 text-sm" />
      </Field>
      <FormButtons pending={pending} label={q ? "Save" : "Add question"} onCancel={onDone} />
    </form>
  );
}

function AnswerForm({ q, onDone }: { q: OpenQuestionRow; onDone: () => void }) {
  const { pending, exec } = useAction();
  const [log, setLog] = useState(true);
  return (
    <form
      className="grid gap-2 rounded-lg bg-muted/40 p-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => answerOpenQuestion(q.id, fd), log ? "Answered and logged as a decision" : "Answered");
        if (res.ok) onDone();
      })}
    >
      <Field label="Answer">
        <Textarea name="answerMd" required defaultValue={q.answerMd} className="min-h-16 text-sm" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="logDecision" checked={log} onChange={(e) => setLog(e.target.checked)} />
        Also log it as a decision
      </label>
      {log && (
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_9rem]">
          <Field label="Decision" hint="Default: the first line of the answer">
            <Input name="decisionTitle" />
          </Field>
          <Field label="Who decided">
            <Input name="decidedBy" defaultValue={q.owner ?? ""} />
          </Field>
          <Field label="Date">
            <Input name="decidedOn" type="date" defaultValue={toDateString(new Date())} />
          </Field>
        </div>
      )}
      <FormButtons pending={pending} label="Save answer" onCancel={onDone} />
    </form>
  );
}

export function OpenQuestions({ projectId, rows }: { projectId: number; rows: OpenQuestionRow[] }) {
  const [editing, setEditing] = useState<OpenQuestionRow | "new" | null>(null);
  const [answering, setAnswering] = useState<number | null>(null);
  const { pending, exec } = useAction();
  const today = toDateString(new Date());
  const open = rows.filter((r) => r.status === "open" || r.status === "in_progress").length;
  return (
    <section className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Open questions</h2>
        {open > 0 && <Badge variant="secondary">{open} open</Badge>}
        <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </div>
      {editing && (
        <QuestionForm
          key={editing === "new" ? "new" : editing.id}
          projectId={projectId}
          q={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Nothing waiting for an answer. Log what the client still has to decide, so it doesn&apos;t get lost in chats.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((q) => {
            const closed = q.status === "answered" || q.status === "dropped";
            const overdue = !closed && q.dueDate != null && q.dueDate < today;
            return (
              <li key={q.id} className="group grid gap-1 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{q.code}</span>
                  <span className={cn("flex-1 font-medium", closed && "text-muted-foreground", q.status === "dropped" && "line-through")}>
                    {q.question}
                  </span>
                  <Badge variant={q.status === "answered" ? "default" : q.status === "in_progress" ? "secondary" : "outline"}>
                    {labelOf(OPEN_QUESTION_STATUSES, q.status)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-14 text-xs text-muted-foreground">
                  {[q.owner && `asks ${q.owner}`, q.whereInDocs && `see ${q.whereInDocs}`, `asked ${day(q.askedOn)}`]
                    .filter(Boolean)
                    .join(" · ")}
                  {q.dueDate && !closed && (
                    <span className={cn(overdue && "font-medium text-destructive")}>· needed by {day(q.dueDate)}</span>
                  )}
                  {q.closedOn && <span>· closed {day(q.closedOn)}</span>}
                  <span className="ml-auto flex gap-0.5">
                    {!closed && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => setAnswering(q.id)}>
                          <CheckIcon /> Answer
                        </Button>
                        {q.status === "open" ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => exec(() => setOpenQuestionStatus(q.id, "in_progress"))}
                          >
                            In progress
                          </Button>
                        ) : null}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          title="No longer relevant"
                          onClick={() => exec(() => setOpenQuestionStatus(q.id, "dropped"), "Dropped")}
                        >
                          <XIcon /> Drop
                        </Button>
                      </>
                    )}
                    {closed && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => exec(() => setOpenQuestionStatus(q.id, "open"), "Reopened")}
                      >
                        <ArchiveRestoreIcon /> Reopen
                      </Button>
                    )}
                    <span className="flex opacity-0 group-hover:opacity-100">
                      <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(q)}>
                        <PencilIcon />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        title="Delete"
                        onClick={() => confirm(`Delete ${q.code}?`) && exec(() => deleteOpenQuestion(q.id))}
                      >
                        <Trash2Icon />
                      </Button>
                    </span>
                  </span>
                </div>
                {q.detailsMd && !closed && <Markdown className="pl-14 text-muted-foreground">{q.detailsMd}</Markdown>}
                {answering === q.id && (
                  <div className="pl-14">
                    <AnswerForm q={q} onDone={() => setAnswering(null)} />
                  </div>
                )}
                {q.status === "answered" && q.answerMd && (
                  <div className="pl-14">
                    <Markdown>{q.answerMd}</Markdown>
                    {q.decision && (
                      <Link href={`/projects/${projectId}/scope`} className="text-xs text-muted-foreground underline">
                        Decision: {q.decision.title}
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------- Business rules ----------

function RuleForm({
  projectId,
  rule,
  decisions,
  onDone,
}: {
  projectId: number;
  rule?: BusinessRuleRow;
  decisions: DecisionRow[];
  onDone: () => void;
}) {
  const { pending, exec } = useAction();
  return (
    <form
      className="grid gap-2 border-b p-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveBusinessRule(rule?.id ?? null, fd), "Saved");
        if (res.ok) onDone();
      })}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <Field label="Code">
          <Input name="code" defaultValue={rule?.code} placeholder="auto" />
        </Field>
        <Field label="Rule">
          <Input name="title" required defaultValue={rule?.title} placeholder="e.g. The bot never quotes prices or margins" />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Kind">
          <NativeSelect name="kind" defaultValue={rule?.kind ?? "constraint"}>
            {RULE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}: {k.hint}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Implemented in" hint="Prompt, workflow, node… so you can check it's really there">
          <Input name="implementedIn" defaultValue={rule?.implementedIn ?? ""} placeholder="main prompt, invoices-general" />
        </Field>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="From decision">
          <NativeSelect name="sourceDecisionId" defaultValue={rule?.sourceDecisionId ?? ""}>
            <option value="">—</option>
            {decisions.map((d) => (
              <option key={d.id} value={d.id}>
                {day(d.decidedOn)} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Other source">
          <Input name="sourceNote" defaultValue={rule?.sourceNote ?? ""} placeholder="handbook p. 4, law, contract…" />
        </Field>
      </div>
      <Field label="Details / exceptions">
        <Textarea name="detailsMd" defaultValue={rule?.detailsMd} className="min-h-16 text-sm" />
      </Field>
      <FormButtons pending={pending} label={rule ? "Save" : "Add rule"} onCancel={onDone} />
    </form>
  );
}

export function BusinessRules({
  projectId,
  rows,
  decisions,
}: {
  projectId: number;
  rows: BusinessRuleRow[];
  decisions: DecisionRow[];
}) {
  const [editing, setEditing] = useState<BusinessRuleRow | "new" | null>(null);
  const { pending, exec } = useAction();
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Business rules</h2>
        <Button size="xs" variant="ghost" onClick={() => setEditing("new")}>
          <PlusIcon /> Add
        </Button>
      </div>
      {editing && (
        <RuleForm
          key={editing === "new" ? "new" : editing.id}
          projectId={projectId}
          rule={editing === "new" ? undefined : editing}
          decisions={decisions}
          onDone={() => setEditing(null)}
        />
      )}
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Rules in force right now, e.g. what the system must never say or do. A decision records when something was
          agreed; a rule is what holds today.
        </p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="group grid gap-1 px-3 py-2">
              <div className="flex items-start gap-2">
                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{r.code}</span>
                <span className={cn("flex-1 font-medium", r.retiredAt && "text-muted-foreground line-through")}>{r.title}</span>
                <Badge variant="outline">{labelOf(RULE_KINDS, r.kind)}</Badge>
                {r.retiredAt && <Badge variant="secondary">Retired</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-14 text-xs text-muted-foreground">
                {r.implementedIn ? (
                  <span>in {r.implementedIn}</span>
                ) : (
                  !r.retiredAt && <span className="text-amber-700 dark:text-amber-400">not mapped to where it&apos;s implemented</span>
                )}
                {r.sourceDecision && (
                  <Link href={`/projects/${projectId}/scope`} className="underline">
                    decision {day(r.sourceDecision.decidedOn)}
                  </Link>
                )}
                {r.sourceNote && <span>{r.sourceNote}</span>}
                <span className="ml-auto flex opacity-0 group-hover:opacity-100">
                  <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(r)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => exec(() => setBusinessRuleRetired(r.id, !r.retiredAt), r.retiredAt ? "Back in force" : "Retired")}
                  >
                    {r.retiredAt ? "Restore" : "Retire"}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    title="Delete"
                    onClick={() => confirm(`Delete ${r.code}? Retire it instead if docs refer to it.`) && exec(() => deleteBusinessRule(r.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </span>
              </div>
              {r.detailsMd && <Markdown className="pl-14 text-muted-foreground">{r.detailsMd}</Markdown>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
