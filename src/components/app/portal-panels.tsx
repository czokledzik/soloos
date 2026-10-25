"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CopyIcon, ExternalLinkIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectUpdate } from "@/db/schema";
import { PORTAL_LANGS, type PortalLang } from "@/lib/portal-text";
import {
  deleteProjectUpdate,
  disablePortal,
  enablePortal,
  saveProjectUpdate,
  setDocPagePublished,
  setPortalLang,
  setPortalSection,
  setUpdatePublished,
  type PortalSection,
} from "@/server/portal-actions";
import { Markdown } from "./markdown";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";

type Sections = Record<PortalSection, boolean>;

export function PortalLink({
  projectId,
  token,
  origin,
  sections,
  lang,
}: {
  projectId: number;
  token: string | null;
  origin: string;
  sections: Sections;
  lang: PortalLang;
}) {
  const { pending, exec } = useAction();
  const url = token ? `${origin}/p/${token}` : null;
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">Client portal</h2>
        <Badge variant={token ? "default" : "outline"}>{token ? "On" : "Off"}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        A read-only page for the client: published updates and doc pages (always the latest version), plus the
        sections switched on below. Anyone with the link can open it; notes, messages and internal pages are never shown.
      </p>
      {token && url ? (
        <div className="mt-3 grid gap-2">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label="Portal link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}
              title="Copy link"
            >
              <CopyIcon />
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center px-2" title="Open portal">
              <ExternalLinkIcon className="size-4" />
            </a>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                confirm("Make a new link? The current one stops working.") && exec(() => enablePortal(projectId), "New link ready")
              }
            >
              New link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => confirm("Turn the portal off? The link stops working.") && exec(() => disablePortal(projectId), "Portal off")}
            >
              Turn off
            </Button>
          </div>
        </div>
      ) : null}
      <label className="mt-3 flex items-center gap-2 text-sm">
        <span className="font-medium">Client language</span>
        <NativeSelect
          className="w-36"
          defaultValue={lang}
          disabled={pending}
          onChange={(e) => exec(() => setPortalLang(projectId, e.target.value as PortalLang), "Portal language saved")}
        >
          {PORTAL_LANGS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </NativeSelect>
      </label>
      <PortalSectionToggles projectId={projectId} sections={sections} />
      {!token && (
        <Button className="mt-3" size="sm" disabled={pending} onClick={() => exec(() => enablePortal(projectId), "Portal on")}>
          Turn on
        </Button>
      )}
    </section>
  );
}

const SECTION_LABELS: { key: PortalSection; label: string; hint: string }[] = [
  { key: "progress", label: "Task progress", hint: "done / total tasks, so only if the task list is meant for the client" },
  { key: "hours", label: "Hours report", hint: "billable entries with notes, value at the logged rates, payments and what's due" },
  { key: "decisions", label: "Decision log", hint: "date, title, details and who decided; not the sources" },
];

/** Optional portal sections; each checkbox saves at once and rolls back if saving fails. */
function PortalSectionToggles({ projectId, sections }: { projectId: number; sections: Sections }) {
  const { exec } = useAction();
  const [state, setState] = useState(sections);
  return (
    <fieldset className="mt-3 grid gap-1.5 text-sm">
      <legend className="mb-1 font-medium">Also show</legend>
      {SECTION_LABELS.map(({ key, label, hint }) => (
        <label key={key} className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={state[key]}
            onChange={async (e) => {
              const next = e.target.checked;
              setState((s) => ({ ...s, [key]: next }));
              const res = await exec(() => setPortalSection(projectId, key, next));
              if (!res.ok) setState((s) => ({ ...s, [key]: !next }));
            }}
          />
          <span>
            {label} <span className="text-muted-foreground">· {hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** Checkbox that flips immediately and rolls back if saving fails. */
function PublishToggle({ id, title, published }: { id: number; title: string; published: boolean }) {
  const { exec } = useAction();
  const [checked, setChecked] = useState(published);
  return (
    <label className="flex flex-1 items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={async (e) => {
          const next = e.target.checked;
          setChecked(next);
          const res = await exec(() => setDocPagePublished(id, next));
          if (!res.ok) setChecked(!next);
        }}
      />
      {title}
    </label>
  );
}

export function PortalDocs({ pages }: { pages: { id: number; title: string; published: boolean }[] }) {
  return (
    <section className="rounded-xl border">
      <h2 className="border-b px-3 py-2 text-sm font-medium">Doc pages on the portal</h2>
      {pages.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No doc pages yet (Docs tab).</p>
      ) : (
        <ul className="divide-y text-sm">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <PublishToggle id={p.id} title={p.title} published={p.published} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProjectUpdates({ projectId, updates }: { projectId: number; updates: ProjectUpdate[] }) {
  const [editing, setEditing] = useState<ProjectUpdate | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { pending, exec } = useAction();

  function open(u: ProjectUpdate | "new") {
    setEditing(u);
    setTitle(u === "new" ? `Update ${format(new Date(), "d MMM")}` : u.title);
    setBody(u === "new" ? "" : u.bodyMd);
  }

  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Updates for the client</h2>
        <Button size="xs" variant="ghost" onClick={() => open("new")}>
          <PlusIcon /> New update
        </Button>
      </div>
      {editing && (
        <div className="grid gap-2 border-b p-3">
          <Input aria-label="Update title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            aria-label="Update text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-32 text-sm"
            placeholder="What got done, what's next, what you need from them…"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={async () => {
                const res = await exec(
                  () => saveProjectUpdate(editing === "new" ? null : editing.id, { projectId, title, bodyMd: body }),
                  "Saved as draft",
                );
                if (res.ok) setEditing(null);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {updates.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {updates.map((u) => (
            <li key={u.id} className="group grid gap-1 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.title}</span>
                {u.publishedAt ? (
                  <Badge>Published {format(u.publishedAt, "d MMM")}</Badge>
                ) : (
                  <Badge variant="outline">Draft</Badge>
                )}
                <div className="ml-auto flex gap-0.5">
                  <Button
                    size="xs"
                    variant={u.publishedAt ? "ghost" : "outline"}
                    disabled={pending}
                    onClick={() =>
                      exec(() => setUpdatePublished(u.id, !u.publishedAt), u.publishedAt ? "Unpublished" : "Published")
                    }
                  >
                    {u.publishedAt ? "Unpublish" : "Publish"}
                  </Button>
                  <span className="flex opacity-0 group-hover:opacity-100">
                    <Button size="icon-xs" variant="ghost" title="Edit" onClick={() => open(u)}>
                      <PencilIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title="Delete"
                      onClick={() => confirm("Delete this update?") && exec(() => deleteProjectUpdate(u.id))}
                    >
                      <Trash2Icon />
                    </Button>
                  </span>
                </div>
              </div>
              {u.bodyMd && <Markdown className="text-muted-foreground">{u.bodyMd}</Markdown>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
