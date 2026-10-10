import "server-only";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  contacts,
  db,
  decisions,
  docPages,
  interactions,
  messages,
  opportunities,
  organizations,
  projects,
  tasks,
  threads,
} from "@/db";

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Text search across everything (used by /search and the MCP `search` tool). */
export async function searchAll(query: string) {
  const q = like(query.trim());
  const [clients, people, projs, taskRows, leads, msgs, notes, decs, pages] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name, status: organizations.status })
      .from(organizations)
      .where(and(isNull(organizations.archivedAt), or(ilike(organizations.name, q), ilike(organizations.notesMd, q))))
      .limit(10),
    db
      .select({ id: contacts.id, name: contacts.name, clientId: contacts.orgId, clientName: organizations.name })
      .from(contacts)
      .innerJoin(organizations, eq(contacts.orgId, organizations.id))
      .where(or(ilike(contacts.name, q), sql`array_to_string(${contacts.emails}, ' ') ilike ${q}`))
      .limit(10),
    db
      .select({ id: projects.id, name: projects.name, status: projects.status, clientId: projects.orgId })
      .from(projects)
      .where(and(isNull(projects.archivedAt), or(ilike(projects.name, q), ilike(projects.briefMd, q), ilike(projects.notesMd, q), ilike(projects.scopeMd, q))))
      .limit(10),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, projectId: tasks.projectId })
      .from(tasks)
      .where(or(ilike(tasks.title, q), ilike(tasks.bodyMd, q)))
      .orderBy(desc(tasks.updatedAt))
      .limit(10),
    db
      .select({ id: opportunities.id, title: opportunities.title, stage: opportunities.stage, clientId: opportunities.orgId })
      .from(opportunities)
      .where(or(ilike(opportunities.title, q), ilike(opportunities.originalPostMd, q)))
      .limit(10),
    db
      .select({
        id: messages.id,
        threadId: messages.threadId,
        threadTitle: threads.title,
        clientName: organizations.name,
        sentAt: messages.sentAt,
        body: messages.bodyMd,
      })
      .from(messages)
      .innerJoin(threads, eq(messages.threadId, threads.id))
      .innerJoin(organizations, eq(threads.orgId, organizations.id))
      .where(ilike(messages.bodyMd, q))
      .orderBy(desc(messages.sentAt))
      .limit(15),
    db
      .select({
        id: interactions.id,
        clientId: interactions.orgId,
        clientName: organizations.name,
        title: interactions.title,
        occurredAt: interactions.occurredAt,
        body: interactions.bodyMd,
      })
      .from(interactions)
      .innerJoin(organizations, eq(interactions.orgId, organizations.id))
      .where(or(ilike(interactions.bodyMd, q), ilike(interactions.title, q)))
      .orderBy(desc(interactions.occurredAt))
      .limit(10),
    db
      .select({ id: decisions.id, title: decisions.title, projectId: decisions.projectId, decidedOn: decisions.decidedOn })
      .from(decisions)
      .where(or(ilike(decisions.title, q), ilike(decisions.detailsMd, q)))
      .limit(10),
    db
      .select({ id: docPages.id, title: docPages.title, projectId: docPages.projectId })
      .from(docPages)
      .where(and(isNull(docPages.archivedAt), or(ilike(docPages.title, q), ilike(docPages.bodyMd, q))))
      .limit(10),
  ]);
  return { clients, contacts: people, projects: projs, tasks: taskRows, leads, messages: msgs, conversations: notes, decisions: decs, docPages: pages };
}
export type SearchResults = Awaited<ReturnType<typeof searchAll>>;

/** A short excerpt around the first match, for result lists. */
export function snippet(text: string, query: string, radius = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const i = flat.toLowerCase().indexOf(query.trim().toLowerCase());
  if (i < 0) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? "…" : "");
  const start = Math.max(0, i - radius);
  const end = Math.min(flat.length, i + query.length + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
