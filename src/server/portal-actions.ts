"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, docPages, projectUpdates, projects } from "@/db";
import { findSecret } from "@/lib/secrets";
import { ActionError, run } from "./form";
import { refreshAll } from "./refresh";

/** Turns the portal on with a fresh link (also used to replace a leaked link). */
export async function enablePortal(projectId: number) {
  return run(async () => {
    const token = randomBytes(32).toString("base64url");
    await db.update(projects).set({ portalToken: token }).where(eq(projects.id, projectId));
    refreshAll();
    return token;
  });
}

export async function disablePortal(projectId: number) {
  return run(async () => {
    await db.update(projects).set({ portalToken: null }).where(eq(projects.id, projectId));
    refreshAll();
  });
}

export async function saveProjectUpdate(id: number | null, input: { projectId: number; title: string; bodyMd: string }) {
  return run(async () => {
    const title = input.title.trim();
    if (!title) throw new ActionError("Give the update a title");
    const secret = findSecret(`${title}\n${input.bodyMd}`);
    if (secret) throw new ActionError(`That looks like ${secret}. Don't put credentials in client updates.`);
    if (id) {
      await db.update(projectUpdates).set({ title, bodyMd: input.bodyMd }).where(eq(projectUpdates.id, id));
      refreshAll();
      return id;
    }
    const [row] = await db
      .insert(projectUpdates)
      .values({ projectId: input.projectId, title, bodyMd: input.bodyMd })
      .returning({ id: projectUpdates.id });
    refreshAll();
    return row.id;
  });
}

export async function setUpdatePublished(id: number, published: boolean) {
  return run(async () => {
    await db
      .update(projectUpdates)
      .set({ publishedAt: published ? new Date() : null })
      .where(eq(projectUpdates.id, id));
    refreshAll();
  });
}

export async function deleteProjectUpdate(id: number) {
  return run(async () => {
    await db.delete(projectUpdates).where(eq(projectUpdates.id, id));
    refreshAll();
  });
}

export async function setDocPagePublished(id: number, published: boolean) {
  return run(async () => {
    await db.update(docPages).set({ published }).where(eq(docPages.id, id));
    refreshAll();
  });
}
