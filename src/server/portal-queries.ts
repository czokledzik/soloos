import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, docPages, organizations, projectUpdates, projects, tasks } from "@/db";

/**
 * Everything the client portal shows, and nothing else: no rates, hours, notes,
 * messages or internal docs. Null if the token doesn't match an active portal.
 */
export async function getPortal(token: string) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      dueDate: projects.dueDate,
      clientName: organizations.name,
    })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .where(and(eq(projects.portalToken, token), isNull(projects.archivedAt)));
  if (!project) return null;

  const [counts, updates, docs] = await Promise.all([
    db
      .select({ status: tasks.status, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, project.id))
      .groupBy(tasks.status),
    db
      .select({ id: projectUpdates.id, title: projectUpdates.title, bodyMd: projectUpdates.bodyMd, publishedAt: projectUpdates.publishedAt })
      .from(projectUpdates)
      .where(and(eq(projectUpdates.projectId, project.id), isNotNull(projectUpdates.publishedAt)))
      .orderBy(desc(projectUpdates.publishedAt)),
    db
      .select({ id: docPages.id, title: docPages.title, bodyMd: docPages.bodyMd, updatedAt: docPages.updatedAt })
      .from(docPages)
      .where(and(eq(docPages.projectId, project.id), eq(docPages.published, true), isNull(docPages.archivedAt)))
      .orderBy(asc(docPages.sortOrder), asc(docPages.id)),
  ]);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.count]));
  const total = counts.reduce((s, c) => s + c.count, 0);
  return {
    name: project.name,
    clientName: project.clientName,
    status: project.status,
    dueDate: project.dueDate,
    progress: { total, done: by.done ?? 0, inProgress: (by.in_progress ?? 0) + (by.review ?? 0) },
    updates: updates.map((u) => ({ ...u, publishedAt: u.publishedAt! })),
    docs,
  };
}
export type Portal = NonNullable<Awaited<ReturnType<typeof getPortal>>>;

export async function listProjectUpdates(projectId: number) {
  return db.query.projectUpdates.findMany({
    where: eq(projectUpdates.projectId, projectId),
    orderBy: [desc(projectUpdates.createdAt)],
  });
}
