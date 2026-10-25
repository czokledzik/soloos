"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ExternalLinkIcon, FilesIcon, HistoryIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectSystem } from "@/db/schema";
import { SYSTEM_KINDS, labelOf } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  archiveDocPage,
  createDocPage,
  createDocsFromTemplate,
  deleteSystem,
  restoreRevision,
  saveDocPage,
  saveSystem,
} from "@/server/doc-actions";
import type { DocPageDetail } from "@/server/doc-queries";
import { Field } from "./field";
import { Markdown } from "./markdown";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";
import { submitForm } from "./submit-form";

const MERMAID_EXAMPLE = "```mermaid\nflowchart LR\n  Form --> n8n --> CRM\n```";

export function NewDocPageButton({ projectId }: { projectId: number }) {
  const router = useRouter();
  const { pending, exec } = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={async () => {
        const title = prompt("Page title")?.trim();
        if (!title) return;
        const res = await exec(() => createDocPage(projectId, title));
        if (res.ok && res.data) router.push(`/projects/${projectId}/docs?page=${res.data}`);
      }}
    >
      <PlusIcon /> New page
    </Button>
  );
}

export type TemplateOption = { id: string; name: string; short: string; description: string; pages: number; questions: number };

export function DocTemplateButtons({ projectId, templates }: { projectId: number; templates: TemplateOption[] }) {
  const router = useRouter();
  const { pending, exec } = useAction();
  return templates.map((t) => (
    <Button
      key={t.id}
      size="sm"
      variant="ghost"
      className="justify-start"
      title={t.description}
      disabled={pending}
      onClick={async () => {
        if (
          !confirm(
            `Add ${t.pages} pages and ${t.questions} open questions from “${t.name}”? Pages and questions the project already has are skipped. New pages stay unpublished.`,
          )
        )
          return;
        const res = await exec(() => createDocsFromTemplate(projectId, t.id));
        if (res.ok && res.data) {
          toast.success(`Added ${res.data.pages} pages and ${res.data.questions} open questions`);
          router.refresh();
        }
      }}
    >
      <FilesIcon /> From template ({t.short})
    </Button>
  ));
}

export function DocPageView({ page, projectId }: { page: DocPageDetail; projectId: number }) {
  const router = useRouter();
  const { pending, exec } = useAction();
  const [editing, setEditing] = useState(page.bodyMd === "");
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.bodyMd);
  const [note, setNote] = useState("");
  const [viewing, setViewing] = useState<DocPageDetail["revisions"][number] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  async function save() {
    const res = await exec(() => saveDocPage(page.id, { title, bodyMd: body, note }), "Saved");
    if (res.ok) {
      setNote("");
      setEditing(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <Input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} className="max-w-md font-medium" />
        ) : (
          <h2 className="text-lg font-semibold">{page.title}</h2>
        )}
        <div className="ml-auto flex gap-1">
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((s) => !s)}>
            <HistoryIcon /> History ({page.revisions.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Archive page"
            onClick={async () => {
              if (!confirm(`Archive “${page.title}”?`)) return;
              const res = await exec(() => archiveDocPage(page.id), "Archived");
              if (res.ok) router.push(`/projects/${projectId}/docs`);
            }}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-4", showHistory && "lg:grid-cols-[minmax(0,1fr)_16rem]")}>
        <div className="min-w-0">
          {editing ? (
            <div className="grid gap-3">
              <div className="grid gap-3 xl:grid-cols-2">
                <Textarea
                  aria-label="Page content"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[28rem] font-mono text-xs"
                  placeholder={`Markdown. Diagrams:\n\n${MERMAID_EXAMPLE}`}
                />
                <div className="min-h-[28rem] overflow-auto rounded-lg border p-4">
                  {body.trim() ? <Markdown>{body}</Markdown> : <p className="text-sm text-muted-foreground">Preview</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Revision note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="What changed? (optional, starts a new revision)"
                  className="max-w-md"
                />
                <Button disabled={pending} onClick={save}>
                  Save
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTitle(page.title);
                    setBody(page.bodyMd);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : viewing ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                <span>
                  Viewing the version from {format(viewing.createdAt, "d MMM yyyy, HH:mm")}
                  {viewing.note && ` (${viewing.note})`}
                </span>
                <Button
                  size="xs"
                  className="ml-auto"
                  disabled={pending}
                  onClick={async () => {
                    const res = await exec(() => restoreRevision(viewing.id), "Restored");
                    if (res.ok) {
                      setBody(viewing.bodyMd);
                      setTitle(viewing.title);
                      setViewing(null);
                    }
                  }}
                >
                  Restore this version
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setViewing(null)}>
                  Back to current
                </Button>
              </div>
              <Markdown>{viewing.bodyMd}</Markdown>
            </div>
          ) : page.bodyMd.trim() ? (
            <Markdown>{page.bodyMd}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Empty page.</p>
          )}
        </div>
        {showHistory && (
          <aside className="rounded-xl border">
            <h3 className="border-b px-3 py-2 text-sm font-medium">History</h3>
            <ol className="max-h-[32rem] divide-y overflow-y-auto text-sm">
              {page.revisions.map((r, i) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={cn("w-full px-3 py-2 text-left hover:bg-muted/40", viewing?.id === r.id && "bg-muted")}
                    onClick={() => setViewing(i === 0 ? null : r)}
                  >
                    <div className="tabular-nums">{format(r.createdAt, "d MMM yyyy, HH:mm")}</div>
                    <div className="truncate text-xs text-muted-foreground">{i === 0 ? "Current" : (r.note ?? r.title)}</div>
                  </button>
                </li>
              ))}
              {page.revisions.length === 0 && <li className="px-3 py-2 text-muted-foreground">No saved versions yet.</li>}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}

export function SystemsCard({ projectId, systems }: { projectId: number; systems: ProjectSystem[] }) {
  const [editing, setEditing] = useState<ProjectSystem | "new" | null>(null);
  const { pending, exec } = useAction();
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Systems</h2>
        <Button size="icon-xs" variant="ghost" title="Add system" onClick={() => setEditing("new")}>
          <PlusIcon />
        </Button>
      </div>
      {editing && (
        <form
          className="grid gap-2 border-b p-3"
          onSubmit={submitForm(async (fd) => {
            const res = await exec(() => saveSystem(editing === "new" ? null : editing.id, fd), "Saved");
            if (res.ok) setEditing(null);
          })}
        >
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <Field label="Kind">
              <NativeSelect name="kind" defaultValue={editing === "new" ? "repo" : editing.kind}>
                {SYSTEM_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Name">
              <Input name="name" required defaultValue={editing === "new" ? "" : editing.name} />
            </Field>
          </div>
          <Field label="Link">
            <Input name="url" type="url" placeholder="https://…" defaultValue={editing === "new" ? "" : (editing.url ?? "")} />
          </Field>
          <Field label="Notes" hint="Never credentials: say where they live instead (e.g. 1Password → Clients).">
            <Input name="notes" defaultValue={editing === "new" ? "" : editing.notes} />
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
      {systems.length === 0 && !editing ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Repos, n8n workflows, agents, databases… links only.</p>
      ) : (
        <ul className="divide-y text-sm">
          {systems.map((s) => (
            <li key={s.id} className="group flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{labelOf(SYSTEM_KINDS, s.kind)}</span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate font-medium hover:underline">
                      {s.name} <ExternalLinkIcon className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate font-medium">{s.name}</span>
                  )}
                </div>
                {s.notes && <div className="text-xs text-muted-foreground">{s.notes}</div>}
              </div>
              <div className="flex opacity-0 group-hover:opacity-100">
                <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => setEditing(s)}>
                  <PencilIcon />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  title="Delete"
                  onClick={() => confirm(`Remove ${s.name}?`) && exec(() => deleteSystem(s.id), "Removed")}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function DocPageList({
  projectId,
  pages,
  current,
}: {
  projectId: number;
  pages: { id: number; title: string; todos: number }[];
  current: number | null;
}) {
  return (
    <nav className="grid min-w-0 gap-0.5 text-sm">
      {pages.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${projectId}/docs?page=${p.id}`}
          className={cn(
            "flex min-w-0 items-center gap-1 overflow-hidden rounded-md px-2 py-1",
            p.id === current ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="min-w-0 truncate">{p.title}</span>
          {p.todos > 0 && (
            <span
              className="ml-auto shrink-0 rounded bg-amber-500/15 px-1 text-xs font-normal text-amber-700 tabular-nums dark:text-amber-400"
              title={`${p.todos} placeholders left to fill`}
            >
              {p.todos}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
