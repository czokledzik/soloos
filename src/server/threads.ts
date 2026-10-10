import "server-only";
import { ActionError } from "./form";
import { and, eq, inArray, isNull, max, sql } from "drizzle-orm";
import {
  contacts,
  db,
  messages,
  opportunities,
  threadParticipants,
  threads,
  type Interaction,
} from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type IncomingParticipant = { key: string; name: string; handle: string | null; isMe?: boolean };
export type IncomingMessage = { participantKey: string | null; sentAt: Date; body: string; sourceKey?: string | null };
export type IncomingThread = {
  /** Append to this thread instead of finding/creating one. */
  threadId?: number;
  orgId: number;
  opportunityId?: number | null;
  projectId?: number | null;
  channel: Interaction["channel"];
  title: string;
  source: "paste" | "telegram" | "email";
  sourceKey?: string | null;
  participants: IncomingParticipant[];
  messages: IncomingMessage[];
};

/**
 * Writes a thread with its participants and messages. Threads and messages with a
 * source key are deduplicated, so re-importing the same export only adds what's new.
 * Participants are matched to the org's contacts by email, Telegram handle or name.
 */
export async function saveThread(tx: Tx, input: IncomingThread) {
  let threadId = input.threadId ?? null;
  if (threadId != null) {
    const existing = await tx.query.threads.findFirst({ where: eq(threads.id, threadId) });
    if (!existing) throw new ActionError("Thread not found");
    // Appending: the thread decides which client it belongs to.
    input = { ...input, orgId: existing.orgId };
  }
  if (threadId == null && input.sourceKey) {
    const existing = await tx.query.threads.findFirst({ where: eq(threads.sourceKey, input.sourceKey) });
    threadId = existing?.id ?? null;
  }
  const created = threadId == null;
  if (threadId == null) {
    const [t] = await tx
      .insert(threads)
      .values({
        orgId: input.orgId,
        opportunityId: input.opportunityId ?? null,
        projectId: input.projectId ?? null,
        channel: input.channel,
        title: input.title,
        source: input.source,
        sourceKey: input.sourceKey ?? null,
      })
      .returning({ id: threads.id });
    threadId = t.id;
  }

  const participantIds = await upsertParticipants(tx, threadId, input.orgId, input.participants);

  const keys = input.messages.map((m) => m.sourceKey).filter((k): k is string => Boolean(k));
  const known = new Set(
    keys.length
      ? (await tx.select({ key: messages.sourceKey }).from(messages).where(inArray(messages.sourceKey, keys))).map(
          (r) => r.key,
        )
      : [],
  );
  const fresh = input.messages.filter((m) => !m.sourceKey || !known.has(m.sourceKey));
  // Insert in chunks: long Telegram chats have thousands of messages.
  for (let i = 0; i < fresh.length; i += 500) {
    await tx
      .insert(messages)
      .values(
        fresh.slice(i, i + 500).map((m) => ({
          threadId: threadId!,
          participantId: m.participantKey ? (participantIds.get(m.participantKey) ?? null) : null,
          sentAt: m.sentAt,
          bodyMd: m.body,
          sourceKey: m.sourceKey ?? null,
        })),
      )
      .onConflictDoNothing({ target: messages.sourceKey });
  }
  await touchThread(tx, threadId);
  return { threadId, created, added: fresh.length, duplicates: input.messages.length - fresh.length };
}

async function upsertParticipants(tx: Tx, threadId: number, orgId: number, incoming: IncomingParticipant[]) {
  const ids = new Map<string, number>();
  if (incoming.length === 0) return ids;
  const existing = await tx.select().from(threadParticipants).where(eq(threadParticipants.threadId, threadId));
  const orgContacts = await tx.select().from(contacts).where(eq(contacts.orgId, orgId));

  for (const p of incoming) {
    const found = existing.find((e) =>
      p.handle ? e.handle === p.handle : e.handle == null && e.name.toLowerCase() === p.name.toLowerCase(),
    );
    if (found) {
      ids.set(p.key, found.id);
      if (p.isMe && !found.isMe) {
        await tx.update(threadParticipants).set({ isMe: true }).where(eq(threadParticipants.id, found.id));
      }
      continue;
    }
    const contact = p.isMe ? undefined : matchContact(orgContacts, p);
    const [row] = await tx
      .insert(threadParticipants)
      .values({ threadId, name: p.name, handle: p.handle, isMe: p.isMe ?? false, contactId: contact?.id ?? null })
      .returning({ id: threadParticipants.id });
    ids.set(p.key, row.id);
  }
  return ids;
}

type ContactRow = typeof contacts.$inferSelect;

export function matchContact(list: ContactRow[], p: { name: string; handle: string | null }): ContactRow | undefined {
  const handle = p.handle?.toLowerCase().replace(/^(mailto:|telegram:|@)/, "");
  if (handle) {
    const byHandle = list.find(
      (c) =>
        c.emails.some((e) => e.toLowerCase() === handle) ||
        (c.telegram && c.telegram.toLowerCase().replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "") === handle),
    );
    if (byHandle) return byHandle;
  }
  const name = p.name.trim().toLowerCase();
  return name ? list.find((c) => c.name.trim().toLowerCase() === name) : undefined;
}

/** Recomputes the thread's last message time (used for sorting and "last contact"). */
export async function touchThread(tx: Tx, threadId: number) {
  const [{ last }] = await tx
    .select({ last: max(messages.sentAt) })
    .from(messages)
    .where(eq(messages.threadId, threadId));
  await tx
    .update(threads)
    .set({ lastMessageAt: last ? new Date(last) : null })
    .where(eq(threads.id, threadId));
}

/** Writing to a new lead from a thread counts as contacting it, like logging a conversation does. */
export async function markLeadContacted(tx: Tx, threadId: number) {
  const thread = await tx.query.threads.findFirst({ where: eq(threads.id, threadId) });
  if (!thread?.opportunityId) return;
  const [{ mine }] = await tx
    .select({ mine: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(threadParticipants, eq(messages.participantId, threadParticipants.id))
    .where(and(eq(messages.threadId, threadId), eq(threadParticipants.isMe, true)));
  if (mine > 0) {
    await tx
      .update(opportunities)
      .set({ stage: "contacted" })
      .where(and(eq(opportunities.id, thread.opportunityId), eq(opportunities.stage, "new")));
  }
}

/** When a lead becomes a project, its threads follow (same as logged conversations). */
export async function moveLeadThreadsToProject(tx: Tx, opportunityId: number, projectId: number) {
  await tx
    .update(threads)
    .set({ projectId })
    .where(and(eq(threads.opportunityId, opportunityId), isNull(threads.projectId)));
}
