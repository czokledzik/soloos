import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { changeRequests, db, decisions, docPages, docRevisions, systems } from "@/db";

export async function listDecisions(projectId: number) {
  return db.query.decisions.findMany({
    where: eq(decisions.projectId, projectId),
    with: {
      sourceMessage: { columns: { id: true, threadId: true, bodyMd: true, sentAt: true } },
      sourceInteraction: { columns: { id: true, title: true, occurredAt: true } },
    },
    orderBy: [desc(decisions.decidedOn), desc(decisions.id)],
  });
}
export type DecisionRow = Awaited<ReturnType<typeof listDecisions>>[number];

export async function listChangeRequests(projectId: number) {
  return db.query.changeRequests.findMany({
    where: eq(changeRequests.projectId, projectId),
    with: { sourceMessage: { columns: { id: true, threadId: true } } },
    orderBy: [desc(changeRequests.requestedOn), desc(changeRequests.id)],
  });
}
export type ChangeRequestRow = Awaited<ReturnType<typeof listChangeRequests>>[number];

export async function listDocPages(projectId: number) {
  return db
    .select({ id: docPages.id, title: docPages.title, updatedAt: docPages.updatedAt })
    .from(docPages)
    .where(and(eq(docPages.projectId, projectId), isNull(docPages.archivedAt)))
    .orderBy(asc(docPages.sortOrder), asc(docPages.id));
}

export async function getDocPage(id: number) {
  return (
    (await db.query.docPages.findFirst({
      where: eq(docPages.id, id),
      with: {
        revisions: {
          columns: { id: true, title: true, note: true, createdAt: true, bodyMd: true },
          orderBy: [desc(docRevisions.createdAt), desc(docRevisions.id)],
          limit: 100,
        },
      },
    })) ?? null
  );
}
export type DocPageDetail = NonNullable<Awaited<ReturnType<typeof getDocPage>>>;

export async function listSystems(projectId: number) {
  return db.query.systems.findMany({
    where: eq(systems.projectId, projectId),
    orderBy: [asc(systems.sortOrder), asc(systems.id)],
  });
}
