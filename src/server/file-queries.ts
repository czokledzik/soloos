import "server-only";
import { desc, eq } from "drizzle-orm";
import { attachmentData, attachments, db, projects } from "@/db";

const columns = {
  id: attachments.id,
  orgId: attachments.orgId,
  projectId: attachments.projectId,
  projectName: projects.name,
  name: attachments.name,
  mimeType: attachments.mimeType,
  sizeBytes: attachments.sizeBytes,
  note: attachments.note,
  createdAt: attachments.createdAt,
};

/** Files on a project, or every file of a client (its own and its projects'). Never loads the bytes. */
export async function listAttachments(where: { projectId: number } | { orgId: number }) {
  return db
    .select(columns)
    .from(attachments)
    .leftJoin(projects, eq(projects.id, attachments.projectId))
    .where("projectId" in where ? eq(attachments.projectId, where.projectId) : eq(attachments.orgId, where.orgId))
    .orderBy(desc(attachments.createdAt), desc(attachments.id));
}
export type AttachmentRow = Awaited<ReturnType<typeof listAttachments>>[number];

export async function getAttachmentFile(id: number) {
  const [row] = await db
    .select({ name: attachments.name, mimeType: attachments.mimeType, data: attachmentData.data })
    .from(attachments)
    .innerJoin(attachmentData, eq(attachmentData.attachmentId, attachments.id))
    .where(eq(attachments.id, id));
  return row ?? null;
}
