"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  channel,
  db,
  interactions,
  messages,
  organizations,
  threadParticipants,
  threads,
} from "@/db";
import { ActionError, int, oneOf, run, str } from "./form";
import { refreshAll } from "./refresh";
import { parseTelegramExport } from "./telegram";
import { markLeadContacted, saveThread, touchThread } from "./threads";

// ---------- Paste and fix ----------

const pastedThread = z.object({
  threadId: z.number().int().positive().nullish(),
  orgId: z.number().int().positive(),
  opportunityId: z.number().int().positive().nullish(),
  projectId: z.number().int().positive().nullish(),
  channel: z.enum(channel.enumValues),
  title: z.string().max(200).default(""),
  /** Sender name that is me (shown on the right, counts as outgoing). */
  me: z.string().nullish(),
  /** Pasted interaction being converted; deleted once the thread is saved. */
  interactionId: z.number().int().positive().nullish(),
  messages: z
    .array(
      z.object({
        sender: z.string().max(200),
        at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Every message needs a date and time"),
        body: z.string().max(100_000),
      }),
    )
    .min(1, "Add at least one message"),
});
export type PastedThread = z.input<typeof pastedThread>;

/** Saves the messages from the paste-and-fix screen as a new thread (or appends to one). */
export async function savePastedThread(input: PastedThread) {
  return run(async () => {
    const parsed = pastedThread.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid messages");
    const p = parsed.data;
    const msgs = p.messages.filter((m) => m.body.trim());
    if (msgs.length === 0) throw new ActionError("Add at least one message");

    const threadId = await db.transaction(async (tx) => {
      const names = [...new Set(msgs.map((m) => m.sender.trim()).filter(Boolean))];
      const res = await saveThread(tx, {
        threadId: p.threadId ?? undefined,
        orgId: p.orgId,
        opportunityId: p.opportunityId,
        projectId: p.projectId,
        channel: p.channel,
        title: p.title.trim(),
        source: "paste",
        participants: names.map((name) => ({ key: name, name, handle: null, isMe: name === p.me })),
        messages: msgs.map((m) => ({
          participantKey: m.sender.trim() || null,
          // The browser sends local wall-clock time; the server runs in APP_TIMEZONE.
          sentAt: new Date(m.at),
          body: m.body.trim(),
        })),
      });
      if (p.interactionId) {
        await tx
          .delete(interactions)
          .where(and(eq(interactions.id, p.interactionId), eq(interactions.orgId, p.orgId)));
      }
      await markLeadContacted(tx, res.threadId);
      return res.threadId;
    });
    refreshAll();
    return threadId;
  });
}

// ---------- Threads ----------

export async function updateThread(id: number, fd: FormData) {
  return run(async () => {
    const orgId = int(fd, "orgId");
    if (!orgId) throw new ActionError("Pick a client");
    await db
      .update(threads)
      .set({
        orgId,
        opportunityId: int(fd, "opportunityId"),
        projectId: int(fd, "projectId"),
        channel: oneOf(fd, "channel", channel.enumValues) ?? "other",
        title: str(fd, "title") ?? "",
      })
      .where(eq(threads.id, id));
    await db.transaction((tx) => markLeadContacted(tx, id));
    refreshAll();
  });
}

export async function deleteThread(id: number) {
  return run(async () => {
    await db.delete(threads).where(eq(threads.id, id));
    refreshAll();
  });
}

/** Maps a participant to a contact (or clears it), and/or marks them as me. */
export async function updateParticipant(id: number, patch: { contactId?: number | null; isMe?: boolean }) {
  return run(async () => {
    const values: Partial<typeof threadParticipants.$inferInsert> = {};
    if (patch.contactId !== undefined) values.contactId = patch.contactId;
    if (patch.isMe !== undefined) values.isMe = patch.isMe;
    if (patch.isMe) values.contactId = null;
    const [p] = await db.update(threadParticipants).set(values).where(eq(threadParticipants.id, id)).returning();
    if (!p) throw new ActionError("Participant not found");
    if (patch.isMe) await db.transaction((tx) => markLeadContacted(tx, p.threadId));
    refreshAll();
  });
}

export async function updateMessage(id: number, bodyMd: string) {
  return run(async () => {
    if (!bodyMd.trim()) throw new ActionError("A message can't be empty (delete it instead)");
    await db.update(messages).set({ bodyMd }).where(eq(messages.id, id));
    refreshAll();
  });
}

export async function deleteMessage(id: number) {
  return run(async () => {
    await db.transaction(async (tx) => {
      const [m] = await tx.delete(messages).where(eq(messages.id, id)).returning();
      if (!m) return;
      const left = await tx.query.messages.findFirst({ where: eq(messages.threadId, m.threadId) });
      // An empty thread is just noise on the timeline.
      if (!left) await tx.delete(threads).where(eq(threads.id, m.threadId));
      else await touchThread(tx, m.threadId);
    });
    refreshAll();
  });
}

// ---------- Telegram import ----------

export type TelegramPreviewChat = {
  id: number;
  name: string;
  type: string;
  messages: number;
  from: string;
  to: string;
  participants: { handle: string; name: string; count: number }[];
  suggestedOrgId: number | null;
  alreadyImported: number;
};

export type TelegramSummary = {
  dryRun: boolean;
  meId: string | null;
  errors: string[];
  chats: TelegramPreviewChat[];
  imported?: { threads: number; messages: number; duplicates: number };
};

const telegramChoice = z.record(z.string(), z.number().int().positive());

async function readJson(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ActionError("Choose the result.json file");
  return file.text();
}

/**
 * Telegram Desktop JSON import. A dry run lists the chats with a suggested client
 * for each; the real run imports the chats the user assigned (`assign` = JSON of
 * chat id → org id), as one thread per chat.
 */
export async function importTelegram(fd: FormData) {
  return run(async (): Promise<TelegramSummary> => {
    const dryRun = str(fd, "dryRun") === "1";
    const parsed = parseTelegramExport(await readJson(fd));
    const meId = str(fd, "meId") ?? parsed.meId;

    const allContacts = await db.query.contacts.findMany();
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    const orgIds = new Set(orgs.map((o) => o.id));
    const existing = new Map(
      (await db.select({ key: threads.sourceKey, id: threads.id }).from(threads)).map((t) => [t.key, t.id]),
    );

    const counts = new Map<number, number>();
    for (const [key, id] of existing) if (key?.startsWith("telegram:")) counts.set(Number(key.slice(9)), id);

    const chats: TelegramPreviewChat[] = [];
    for (const c of parsed.chats) {
      const others = c.participants.filter((p) => p.handle !== meId);
      const match = allContacts.find((ct) =>
        others.some(
          (p) =>
            ct.name.trim().toLowerCase() === p.name.trim().toLowerCase() ||
            (ct.telegram && ct.telegram.replace(/^@/, "").toLowerCase() === p.handle.toLowerCase()),
        ),
      );
      const threadId = counts.get(c.id);
      const already = threadId
        ? (await db.select({ id: messages.id }).from(messages).where(eq(messages.threadId, threadId))).length
        : 0;
      chats.push({
        id: c.id,
        name: c.name,
        type: c.type,
        messages: c.messages.length,
        from: c.messages[0].sentAt.toISOString(),
        to: c.messages.at(-1)!.sentAt.toISOString(),
        participants: c.participants,
        suggestedOrgId: match?.orgId ?? null,
        alreadyImported: already,
      });
    }
    chats.sort((a, b) => b.to.localeCompare(a.to));
    const summary: TelegramSummary = { dryRun, meId, errors: parsed.errors, chats };
    if (dryRun) return summary;

    let assign: Record<string, number>;
    try {
      assign = telegramChoice.parse(JSON.parse(str(fd, "assign") ?? "{}"));
    } catch {
      throw new ActionError("Pick a client for the chats to import");
    }
    const picked = parsed.chats.filter((c) => assign[String(c.id)] && orgIds.has(assign[String(c.id)]));
    if (picked.length === 0) throw new ActionError("Pick a client for at least one chat");

    const totals = { threads: 0, messages: 0, duplicates: 0 };
    await db.transaction(async (tx) => {
      for (const c of picked) {
        const res = await saveThread(tx, {
          orgId: assign[String(c.id)],
          channel: "telegram",
          title: c.name,
          source: "telegram",
          sourceKey: `telegram:${c.id}`,
          participants: c.participants.map((p) => ({
            key: p.handle,
            name: p.name,
            handle: `telegram:${p.handle}`,
            isMe: p.handle === meId,
          })),
          messages: c.messages.map((m) => ({
            participantKey: m.fromId,
            sentAt: m.sentAt,
            body: m.body,
            sourceKey: `telegram:${c.id}:${m.id}`,
          })),
        });
        if (res.created) totals.threads++;
        totals.messages += res.added;
        totals.duplicates += res.duplicates;
      }
    });
    refreshAll();
    return { ...summary, imported: totals };
  });
}
