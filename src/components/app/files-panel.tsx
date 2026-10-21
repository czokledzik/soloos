"use client";

import { useRef, useState } from "react";
import { DownloadIcon, FileIcon, FileTextIcon, ImageIcon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/files";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { deleteAttachment, updateAttachment, uploadAttachments } from "@/server/file-actions";
import type { AttachmentRow } from "@/server/file-queries";
import { submitForm } from "./submit-form";
import { useAction } from "./use-action";

/**
 * Files on a project (`projectId`) or a client (`orgId`; lists its projects' files too,
 * uploads go to the client itself). `compact` is the sidebar card on the client page.
 */
export function FilesPanel({
  files,
  projectId,
  orgId,
  compact,
}: {
  files: AttachmentRow[];
  projectId?: number;
  orgId?: number;
  compact?: boolean;
}) {
  const { pending, exec } = useAction();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const note = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | File[]) {
    const chosen = Array.from(list);
    const tooBig = chosen.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`${tooBig.name} is ${formatBytes(tooBig.size)}; files can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    let saved = 0;
    // One request per file keeps each upload under the hosting's request size limit.
    for (const file of chosen) {
      const fd = new FormData();
      fd.set("file", file);
      if (projectId != null) fd.set("projectId", String(projectId));
      if (orgId != null) fd.set("orgId", String(orgId));
      fd.set("note", note.current?.value ?? "");
      const res = await exec(() => uploadAttachments(fd));
      if (res.ok) saved++;
    }
    if (saved) {
      toast.success(saved === 1 ? "File attached" : `${saved} files attached`);
      if (note.current) note.current.value = "";
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div className={cn("grid gap-3", !compact && "max-w-3xl")}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={cn(
          "grid gap-2 rounded-xl border border-dashed p-3 text-sm",
          dragging && "border-foreground bg-muted/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
            <UploadIcon /> {pending ? "Uploading…" : "Upload files"}
          </Button>
          {!compact && <span className="text-muted-foreground">or drop them here · up to {formatBytes(MAX_FILE_BYTES)} each</span>}
        </div>
        {!compact && <Input ref={note} placeholder="Note for these files (optional), e.g. signed version" aria-label="Note" />}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          aria-label="Files to upload"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{compact ? "None." : "No files yet."}</p>
      ) : (
        <div className="divide-y rounded-xl border">
          {files.map((f) => (
            <FileRow key={f.id} file={f} showProject={projectId == null} compact={compact} pending={pending} exec={exec} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file: f,
  showProject,
  compact,
  pending,
  exec,
}: {
  file: AttachmentRow;
  showProject: boolean;
  compact?: boolean;
  pending: boolean;
  exec: ReturnType<typeof useAction>["exec"];
}) {
  const [editing, setEditing] = useState(false);
  const Icon = f.mimeType.startsWith("image/") ? ImageIcon : f.mimeType === "application/pdf" ? FileTextIcon : FileIcon;

  if (editing) {
    return (
      <form
        className="grid gap-2 p-3"
        onSubmit={submitForm(async (fd) => {
          const res = await exec(() => updateAttachment(f.id, fd), "Saved");
          if (res.ok) setEditing(false);
        })}
      >
        <Input name="name" defaultValue={f.name} aria-label="File name" required />
        <Input name="note" defaultValue={f.note} aria-label="Note" placeholder="Note" />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-3 py-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <a href={`/files/${f.id}`} target="_blank" rel="noreferrer" className="block truncate hover:underline" title={f.name}>
          {f.name}
        </a>
        <div className="truncate text-xs text-muted-foreground">
          {[
            formatBytes(f.sizeBytes),
            formatDate(f.createdAt, "d MMM yyyy"),
            showProject && (f.projectName ?? "Client"),
            !compact && f.note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <a
          href={`/files/${f.id}?download`}
          aria-label={`Download ${f.name}`}
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <DownloadIcon className="size-3.5" />
        </a>
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${f.name}`} onClick={() => setEditing(true)}>
          <PencilIcon />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete ${f.name}`}
          onClick={() => confirm(`Delete ${f.name}?`) && exec(() => deleteAttachment(f.id), "File deleted")}
        >
          <Trash2Icon />
        </Button>
      </div>
    </div>
  );
}
