import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { businessRules, changeRequests, db, decisions, docPages, docRevisions, openQuestions, systems } from "@/db";
import { TODO_MARKER } from "@/lib/doc-templates";

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
    .select({
      id: docPages.id,
      title: docPages.title,
      updatedAt: docPages.updatedAt,
      // How many "[DO UZUPEŁNIENIA…" placeholders are left to fill.
      todos: sql<number>`((length(${docPages.bodyMd}) - length(replace(${docPages.bodyMd}, ${TODO_MARKER}, ''))) / ${TODO_MARKER.length})::int`,
    })
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

/** Rules in force first, then retired ones; each group by code. */
export async function listBusinessRules(projectId: number) {
  return db.query.businessRules.findMany({
    where: eq(businessRules.projectId, projectId),
    with: { sourceDecision: { columns: { id: true, title: true, decidedOn: true } } },
    orderBy: [sql`${businessRules.retiredAt} is not null`, asc(businessRules.code)],
  });
}
export type BusinessRuleRow = Awaited<ReturnType<typeof listBusinessRules>>[number];

/** Open and in-progress questions first (earliest due date first), then closed ones by code. */
export async function listOpenQuestions(projectId: number) {
  return db.query.openQuestions.findMany({
    where: eq(openQuestions.projectId, projectId),
    with: { decision: { columns: { id: true, title: true } } },
    orderBy: [
      sql`${openQuestions.status} in ('answered', 'dropped')`,
      sql`${openQuestions.dueDate} asc nulls last`,
      asc(openQuestions.code),
    ],
  });
}
export type OpenQuestionRow = Awaited<ReturnType<typeof listOpenQuestions>>[number];
