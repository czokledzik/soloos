"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { CheckIcon, CopyIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AiResult } from "@/server/ai/tasks";
import { askClaude } from "@/server/ai-actions";
import { createTask } from "@/server/actions";
import { saveChangeRequest, saveDecision, updateProjectBrief } from "@/server/doc-actions";
import type { ActionResult } from "@/server/form";
import { Markdown } from "./markdown";
import { useAction } from "./use-action";

export type AiJobView = {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  provider: string;
  error: string | null;
  result: unknown;
  createdAt: string;
} | null;

type Kind = "thread_insights" | "project_brief" | "lead_reply";

/** "Ask Claude" with the latest answer for this subject; polls while a runner job is pending. */
export function AiPanel({
  kind,
  subjectId,
  job,
  enabled,
  label,
  children,
}: {
  kind: Kind;
  subjectId: number;
  job: AiJobView;
  enabled: boolean;
  label: string;
  children?: (result: unknown) => React.ReactNode;
}) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const waiting = job?.status === "queued" || job?.status === "running";

  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [waiting, router]);

  if (!enabled) return null;
  return (
    <section className="rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <SparklesIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Claude</h2>
        {job && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNowStrict(new Date(job.createdAt), { addSuffix: true })}
          </span>
        )}
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={pending || waiting}
          onClick={() => exec(() => askClaude(kind, subjectId))}
        >
          {pending ? "Thinking…" : job ? "Ask again" : label}
        </Button>
      </div>
      <div className="p-3 text-sm">
        {!job && !pending && <p className="text-muted-foreground">Nothing asked yet.</p>}
        {pending && <p className="animate-pulse text-muted-foreground">Claude is reading…</p>}
        {!pending && waiting && (
          <p className="animate-pulse text-muted-foreground">
            {job!.status === "queued" ? "Waiting for the local runner to pick this up…" : "The runner is working on it…"}
          </p>
        )}
        {!pending && job?.status === "failed" && <p className="text-red-600">{job.error}</p>}
        {!pending && job?.status === "done" && children?.(job.result)}
      </div>
    </section>
  );
}

/** A suggestion row with an "add" button that turns into a check once used. */
function Suggestion({
  children,
  action,
  actionLabel,
  disabledReason,
}: {
  children: React.ReactNode;
  action: () => Promise<ActionResult<unknown>>;
  actionLabel: string;
  disabledReason?: string;
}) {
  const { pending, exec } = useAction();
  const [done, setDone] = useState(false);
  return (
    <li className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1">{children}</div>
      {done ? (
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Added" />
      ) : (
        <Button
          size="xs"
          variant="outline"
          disabled={pending || Boolean(disabledReason)}
          title={disabledReason}
          onClick={async () => {
            const res = await exec(action, "Added");
            if (res.ok) setDone(true);
          }}
        >
          {actionLabel}
        </Button>
      )}
    </li>
  );
}

function form(values: Record<string, string | number | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null && v !== "") fd.set(k, String(v));
  return fd;
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button size="xs" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success("Copied"))}>
      <CopyIcon /> Copy
    </Button>
  );
}

export function ThreadInsights({ result, projectId }: { result: unknown; projectId: number | null }) {
  const r = result as AiResult<"thread_insights">;
  const noProject = projectId ? undefined : "Link this thread to a project first";
  return (
    <div className="grid gap-4">
      <p>{r.summary}</p>
      {r.decisions.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Decisions</h3>
          <ul className="divide-y">
            {r.decisions.map((d, i) => (
              <Suggestion
                key={i}
                actionLabel="Log"
                disabledReason={noProject}
                action={() =>
                  saveDecision(
                    null,
                    form({
                      projectId,
                      title: d.title,
                      detailsMd: d.details,
                      decidedBy: d.decidedBy,
                      decidedOn: d.decidedOn,
                      sourceMessageId: d.sourceMessageId,
                    }),
                  )
                }
              >
                <div className="font-medium">{d.title}</div>
                {(d.decidedBy || d.details) && (
                  <div className="text-xs text-muted-foreground">{[d.decidedBy, d.details].filter(Boolean).join(" · ")}</div>
                )}
              </Suggestion>
            ))}
          </ul>
        </div>
      )}
      {r.changeRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Scope changes</h3>
          <ul className="divide-y">
            {r.changeRequests.map((c, i) => (
              <Suggestion
                key={i}
                actionLabel="Propose"
                disabledReason={noProject}
                action={() =>
                  saveChangeRequest(
                    null,
                    form({
                      projectId,
                      title: c.title,
                      detailsMd: c.details,
                      requestedBy: c.requestedBy,
                      hoursImpact: c.hoursImpact,
                      priceImpact: c.priceImpact,
                      sourceMessageId: c.sourceMessageId,
                    }),
                  )
                }
              >
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">
                  {[c.requestedBy, c.hoursImpact, c.priceImpact != null && `${c.priceImpact > 0 ? "+" : ""}${c.priceImpact}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </Suggestion>
            ))}
          </ul>
        </div>
      )}
      {r.tasks.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Tasks</h3>
          <ul className="divide-y">
            {r.tasks.map((t, i) => (
              <Suggestion
                key={i}
                actionLabel="Create"
                disabledReason={noProject}
                action={() => createTask(form({ projectId, title: t.title, dueDate: t.dueDate }))}
              >
                {t.title}
                {t.dueDate && <span className="text-xs text-muted-foreground"> · due {t.dueDate}</span>}
              </Suggestion>
            ))}
          </ul>
        </div>
      )}
      {r.openQuestions.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">Unanswered questions</h3>
          <ul className="list-disc pl-5">
            {r.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {r.replyDraft && (
        <div className="grid gap-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-muted-foreground">Reply draft</h3>
            <CopyButton text={r.replyDraft} />
          </div>
          <p className="rounded-lg bg-muted/50 p-2 whitespace-pre-wrap">{r.replyDraft}</p>
        </div>
      )}
    </div>
  );
}

export function BriefSuggestion({ result, projectId }: { result: unknown; projectId: number }) {
  const r = result as AiResult<"project_brief">;
  const { pending, exec } = useAction();
  return (
    <div className="grid gap-2">
      <Markdown>{r.briefMd}</Markdown>
      <div>
        <Button size="xs" disabled={pending} onClick={() => exec(() => updateProjectBrief(projectId, r.briefMd), "Brief updated")}>
          Use this brief
        </Button>
      </div>
    </div>
  );
}

export function LeadReply({ result }: { result: unknown }) {
  const r = result as AiResult<"lead_reply">;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground">Reply</h3>
        <CopyButton text={r.replyMd} />
      </div>
      <p className="rounded-lg bg-muted/50 p-2 whitespace-pre-wrap">{r.replyMd}</p>
      {r.questions.length > 0 && (
        <>
          <h3 className="text-xs font-medium text-muted-foreground">Ask before quoting</h3>
          <ul className="list-disc pl-5">
            {r.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// Wrappers usable from server components (which can't pass render functions).

export function ThreadAiPanel({ threadId, projectId, job, enabled }: { threadId: number; projectId: number | null; job: AiJobView; enabled: boolean }) {
  return (
    <AiPanel kind="thread_insights" subjectId={threadId} job={job} enabled={enabled} label="Summarize & extract">
      {(r) => <ThreadInsights result={r} projectId={projectId} />}
    </AiPanel>
  );
}

export function BriefAiPanel({ projectId, job, enabled }: { projectId: number; job: AiJobView; enabled: boolean }) {
  return (
    <AiPanel kind="project_brief" subjectId={projectId} job={job} enabled={enabled} label="Draft the brief">
      {(r) => <BriefSuggestion result={r} projectId={projectId} />}
    </AiPanel>
  );
}

export function LeadAiPanel({ leadId, job, enabled }: { leadId: number; job: AiJobView; enabled: boolean }) {
  return (
    <AiPanel kind="lead_reply" subjectId={leadId} job={job} enabled={enabled} label="Draft a reply">
      {(r) => <LeadReply result={r} />}
    </AiPanel>
  );
}
