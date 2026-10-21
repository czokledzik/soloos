"use server";

import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { attachmentData, attachments, db, projects } from "@/db";
import { MAX_FILE_BYTES, detectMimeType, formatBytes, isTextFile } from "@/lib/files";
import { findSecret } from "@/lib/secrets";
import { ActionError, int, run, str } from "./form";
import { refreshAll } from "./refresh";

/**
 * Attaches the uploaded `file` fields to a project (`projectId`) or, without one,
 * to the client itself (`orgId`). All files are checked before any is saved.
 */
export async function uploadAttachments(fd: FormData) {
  return run(async () => {
    const projectId = int(fd, "projectId");
    let orgId = int(fd, "orgId");
    if (projectId != null) {
      const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
      if (!project) throw new ActionError("Project not found");
      orgId = project.orgId;
    }
    if (orgId == null) throw new ActionError("Choose a client or project");

    const note = str(fd, "note") ?? "";
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new ActionError("Choose a file");
    const secret = findSecret(note);
    if (secret) throw new ActionError(`The note looks like it contains ${secret}. Keep credentials in a password manager, not in SoloOS.`);

    const scope = projectId != null ? eq(attachments.projectId, projectId) : and(eq(attachments.orgId, orgId), isNull(attachments.projectId));
    const existing = await db.select({ name: attachments.name, sha256: attachments.sha256 }).from(attachments).where(scope);

    const prepared: { name: string; mimeType: string; sizeBytes: number; sha256: string; data: Buffer }[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new ActionError(`${file.name} is ${formatBytes(file.size)}; files can be up to ${formatBytes(MAX_FILE_BYTES)}.`);
      }
      const data = Buffer.from(await file.arrayBuffer());
      const mimeType = detectMimeType(file.type, data);
      if (isTextFile(file.name, mimeType)) {
        const found = findSecret(data.toString("utf8"));
        if (found) throw new ActionError(`${file.name} looks like it contains ${found}. Remove it before uploading.`);
      }
      const sha256 = createHash("sha256").update(data).digest("hex");
      const same = existing.find((e) => e.sha256 === sha256) ?? prepared.find((p) => p.sha256 === sha256);
      if (same) throw new ActionError(`${file.name} is already attached as ${same.name}.`);
      prepared.push({ name: file.name.trim() || "file", mimeType, sizeBytes: data.length, sha256, data });
    }

    await db.transaction(async (tx) => {
      for (const { data, ...meta } of prepared) {
        const [row] = await tx.insert(attachments).values({ ...meta, orgId, projectId, note }).returning({ id: attachments.id });
        await tx.insert(attachmentData).values({ attachmentId: row.id, data });
      }
    });
    refreshAll();
    return prepared.length;
  });
}

export async function updateAttachment(id: number, fd: FormData) {
  return run(async () => {
    const name = str(fd, "name");
    const note = str(fd, "note") ?? "";
    if (!name) throw new ActionError("Name is required");
    const secret = findSecret(note) ?? findSecret(name);
    if (secret) throw new ActionError(`That looks like ${secret}. Keep credentials in a password manager, not in SoloOS.`);
    await db.update(attachments).set({ name, note }).where(eq(attachments.id, id));
    refreshAll();
  });
}

export async function deleteAttachment(id: number) {
  return run(async () => {
    await db.delete(attachments).where(eq(attachments.id, id));
    refreshAll();
  });
}
