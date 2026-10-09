import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, messages, organizations, threadParticipants, threads } from "@/db";

/** One message as shown in timelines and the thread view. */
export type MessageView = {
  id: number;
  threadId: number;
  sentAt: Date;
  bodyMd: string;
  sender: string;
  senderContactId: number | null;
  isMe: boolean;
};

export type ThreadView = {
  id: number;
  orgId: number;
  orgName: string;
  opportunityId: number | null;
  projectId: number | null;
  channel: (typeof threads.$inferSelect)["channel"];
  title: string;
  source: (typeof threads.$inferSelect)["source"];
  lastMessageAt: Date | null;
  participants: { id: number; name: string; handle: string | null; contactId: number | null; contactName: string | null; isMe: boolean }[];
  messages: MessageView[];
};

/**
 * Threads with their messages for a client, lead or project timeline. Long
 * chats are cut to the most recent `perThread` messages.
 */
export async function listThreads(where: { orgId?: number; opportunityId?: number; projectId?: number }, perThread = 300) {
  const rows = await db.query.threads.findMany({
    where: and(
      where.orgId ? eq(threads.orgId, where.orgId) : undefined,
      where.opportunityId ? eq(threads.opportunityId, where.opportunityId) : undefined,
      where.projectId ? eq(threads.projectId, where.projectId) : undefined,
    ),
    with: { org: { columns: { name: true } }, participants: { with: { contact: { columns: { name: true } } } } },
    orderBy: [desc(threads.lastMessageAt)],
  });
  return attachMessages(rows, perThread);
}
export async function getThread(id: number) {
  const row = await db.query.threads.findFirst({
    where: eq(threads.id, id),
    with: { org: { columns: { name: true } }, participants: { with: { contact: { columns: { name: true } } } } },
  });
  if (!row) return null;
  const [thread] = await attachMessages([row], 10_000);
  return thread;
}

type ThreadRow = typeof threads.$inferSelect & {
  org: { name: string };
  participants: (typeof threadParticipants.$inferSelect & { contact: { name: string } | null })[];
};

async function attachMessages(rows: ThreadRow[], perThread: number): Promise<ThreadView[]> {
  if (rows.length === 0) return [];
  // Newest `perThread` per thread, via a window function, then back in time order.
  const ranked = db
    .select({
      id: messages.id,
      threadId: messages.threadId,
      participantId: messages.participantId,
      sentAt: messages.sentAt,
      bodyMd: messages.bodyMd,
      rn: sql<number>`row_number() over (partition by ${messages.threadId} order by ${messages.sentAt} desc, ${messages.id} desc)`.as("rn"),
    })
    .from(messages)
    .where(inArray(messages.threadId, rows.map((r) => r.id)))
    .as("ranked");
  const msgRows = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.rn} <= ${perThread}`)
    .orderBy(asc(ranked.sentAt), asc(ranked.id));

  const byThread = new Map<number, MessageView[]>();
  const people = new Map(rows.flatMap((r) => r.participants.map((p) => [p.id, p])));
  for (const m of msgRows) {
    const p = m.participantId ? people.get(m.participantId) : undefined;
    const list = byThread.get(m.threadId) ?? [];
    list.push({
      id: m.id,
      threadId: m.threadId,
      sentAt: new Date(m.sentAt),
      bodyMd: m.bodyMd,
      sender: p ? (p.isMe ? "Me" : (p.contact?.name ?? p.name)) : "",
      senderContactId: p?.contactId ?? null,
      isMe: p?.isMe ?? false,
    });
    byThread.set(m.threadId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    orgName: r.org.name,
    opportunityId: r.opportunityId,
    projectId: r.projectId,
    channel: r.channel,
    title: r.title,
    source: r.source,
    lastMessageAt: r.lastMessageAt,
    participants: r.participants.map((p) => ({
      id: p.id,
      name: p.name,
      handle: p.handle,
      contactId: p.contactId,
      contactName: p.contact?.name ?? null,
      isMe: p.isMe,
    })),
    messages: byThread.get(r.id) ?? [],
  }));
}

/** All threads, newest first, with message counts; optionally filtered by text in messages or titles. */
export async function listAllThreads(q?: string) {
  const search = q?.trim();
  const matching = search
    ? db
        .selectDistinct({ threadId: messages.threadId })
        .from(messages)
        .where(ilike(messages.bodyMd, `%${escapeLike(search)}%`))
    : null;
  return db
    .select({
      id: threads.id,
      title: threads.title,
      channel: threads.channel,
      source: threads.source,
      lastMessageAt: threads.lastMessageAt,
      orgId: organizations.id,
      orgName: organizations.name,
      count: sql<number>`(select count(*) from ${messages} where ${messages.threadId} = ${threads.id})::int`,
      people: sql<string>`(select string_agg(${threadParticipants.name}, ', ' order by ${threadParticipants.id}) from ${threadParticipants} where ${threadParticipants.threadId} = ${threads.id} and not ${threadParticipants.isMe})`,
    })
    .from(threads)
    .innerJoin(organizations, eq(threads.orgId, organizations.id))
    .where(
      matching
        ? or(
            inArray(threads.id, matching),
            ilike(threads.title, `%${escapeLike(search!)}%`),
            ilike(organizations.name, `%${escapeLike(search!)}%`),
          )
        : undefined,
    )
    .orderBy(sql`${threads.lastMessageAt} desc nulls last`)
    .limit(200);
}
export type ThreadListRow = Awaited<ReturnType<typeof listAllThreads>>[number];

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
