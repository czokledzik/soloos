"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
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
// The export is parsed in the browser (src/lib/telegram.ts): full exports are far
// bigger than a serverless request body. Only the chosen chats are sent, in chunks.

export type TelegramChatInfo = { id: number; participants: { handle: string; name: string }[] };
export type TelegramPreview = Record<string, { suggestedOrgId: number | null; alreadyImported: number }>;

/** For each chat: a client guessed from contacts (name or Telegram handle), and how many messages are already in. */
export async function telegramPreview(chats: TelegramChatInfo[], meId: string | null) {
  return run(async (): Promise<TelegramPreview> => {
    const list = z
      .array(z.object({ id: z.number(), participants: z.array(z.object({ handle: z.string(), name: z.string() })).max(500) }))
      .max(2000)
      .parse(chats);
    const allContacts = await db.query.contacts.findMany();
    const keys = list.map((c) => `telegram:${c.id}`);
    const counts = keys.length
      ? await db
          .select({ key: threads.sourceKey, count: sql<number>`count(${messages.id})::int` })
          .from(threads)
          .leftJoin(messages, eq(messages.threadId, threads.id))
          .where(inArray(threads.sourceKey, keys))
          .groupBy(threads.sourceKey)
      : [];
    const out: TelegramPreview = {};
    for (const c of list) {
      const others = c.participants.filter((p) => p.handle !== meId);
      const match = allContacts.find((ct) =>
        others.some(
          (p) =>
            ct.name.trim().toLowerCase() === p.name.trim().toLowerCase() ||
            (ct.telegram && ct.telegram.replace(/^@/, "").toLowerCase() === p.handle.toLowerCase()),
        ),
      );
      out[c.id] = {
        suggestedOrgId: match?.orgId ?? null,
        alreadyImported: counts.find((r) => r.key === `telegram:${c.id}`)?.count ?? 0,
      };
    }
    return out;
  });
}

const telegramChunk = z.object({
  chatId: z.number().int(),
  chatName: z.string().max(300),
  orgId: z.number().int().positive(),
  meId: z.string().nullable(),
  participants: z.array(z.object({ handle: z.string().max(100), name: z.string().max(300) })).max(500),
  messages: z
    .array(z.object({ id: z.number().int(), fromId: z.string().max(100), sentAt: z.string(), body: z.string().max(100_000) }))
    .max(1000),
});
export type TelegramChunk = z.infer<typeof telegramChunk>;

/** Imports one chunk of one chat as (part of) its thread; re-sending a chunk adds nothing. */
export async function importTelegramChunk(input: TelegramChunk) {
  return run(async () => {
    const parsed = telegramChunk.safeParse(input);
    if (!parsed.success) throw new ActionError("That chat couldn't be read");
    const c = parsed.data;
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, c.orgId) });
    if (!org) throw new ActionError("Client not found");
    const res = await db.transaction((tx) =>
      saveThread(tx, {
        orgId: c.orgId,
        channel: "telegram",
        title: c.chatName,
        source: "telegram",
        sourceKey: `telegram:${c.chatId}`,
        participants: c.participants.map((p) => ({
          key: p.handle,
          name: p.name,
          handle: `telegram:${p.handle}`,
          isMe: p.handle === c.meId,
        })),
        messages: c.messages.map((m) => ({
          participantKey: m.fromId,
          sentAt: new Date(m.sentAt),
          body: m.body,
          sourceKey: `telegram:${c.chatId}:${m.id}`,
        })),
      }),
    );
    return { created: res.created, added: res.added, duplicates: res.duplicates };
  });
}

/** Call once after all chunks, so pages pick up the new threads. */
export async function finishTelegramImport() {
  return run(async () => {
    refreshAll();
  });
}

// ---------- Email ----------

/** Runs the IMAP sync now (Settings → Email). */
export async function syncEmailNow() {
  return run(async () => {
    const { emailConfig, imapSource, runEmailSync } = await import("./email-sync");
    const config = emailConfig();
    if (!config) throw new ActionError("Email sync isn't configured: set IMAP_HOST, IMAP_USER and IMAP_PASSWORD");
    let source;
    try {
      source = await imapSource(config);
    } catch (e) {
      throw new ActionError(`Can't connect to ${config.host}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const result = await runEmailSync(config, source);
    refreshAll();
    return result;
  });
}
