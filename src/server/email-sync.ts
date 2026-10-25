import "server-only";
import { eq } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { appState, contacts, db } from "@/db";
import { fromParsedMail, ingestEmails, type IngestSummary, type ParsedEmail } from "./email";

export type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  mailboxes: string[];
  myAddresses: string[];
  /** How far back the first sync of a mailbox looks. */
  sinceDays: number;
};

/** Reads IMAP settings from the environment; null when email sync isn't set up. */
export function emailConfig(): EmailConfig | null {
  const { IMAP_HOST, IMAP_USER, IMAP_PASSWORD } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASSWORD) return null;
  const port = Number(process.env.IMAP_PORT || 993);
  return {
    host: IMAP_HOST,
    port,
    secure: port === 993,
    user: IMAP_USER,
    password: IMAP_PASSWORD,
    mailboxes: (process.env.IMAP_MAILBOXES || "INBOX,INBOX.Sent").split(",").map((m) => m.trim()).filter(Boolean),
    myAddresses: [IMAP_USER, ...(process.env.EMAIL_ME_ADDRESSES ?? "").split(",")].map((a) => a.trim().toLowerCase()).filter(Boolean),
    sinceDays: Number(process.env.IMAP_SINCE_DAYS || 30),
  };
}

export type MailboxState = { uidValidity: string; lastUid: number };
export type FetchedMail = { uid: number; source: Buffer };

/** Where mail comes from; the IMAP implementation is below, tests use a fake. */
export interface MailSource {
  /** New messages in a mailbox since `state` (or since `since` on first sync / UIDVALIDITY change). */
  fetch(
    mailbox: string,
    state: MailboxState | null,
    since: Date,
    limit: number,
  ): Promise<{ uidValidity: string; messages: FetchedMail[] }>;
  close(): Promise<void>;
}

export type SyncResult = IngestSummary & {
  at: string;
  mailboxes: { name: string; fetched: number; error?: string }[];
};

const stateKey = (user: string, mailbox: string) => `email:${user}:${mailbox}`;
export const LAST_RUN_KEY = "email:last_run";

/** Fetches new mail from each mailbox, stores what involves known contacts, remembers progress. */
export async function runEmailSync(config: EmailConfig, source: MailSource, limit = 300): Promise<SyncResult> {
  const result: SyncResult = {
    at: new Date().toISOString(),
    imported: 0,
    duplicates: 0,
    skipped: 0,
    threadsCreated: 0,
    mailboxes: [],
  };
  const contactRefs = (await db.select({ id: contacts.id, orgId: contacts.orgId, emails: contacts.emails }).from(contacts)).filter(
    (c) => c.emails.length > 0,
  );
  const since = new Date(Date.now() - config.sinceDays * 86_400_000);
  try {
    for (const mailbox of config.mailboxes) {
      const key = stateKey(config.user, mailbox);
      try {
        const row = await db.query.appState.findFirst({ where: eq(appState.key, key) });
        const state = (row?.value as MailboxState | undefined) ?? null;
        const fetched = await source.fetch(mailbox, state, since, limit);
        const parsed: ParsedEmail[] = [];
        for (const m of fetched.messages) {
          const p = fromParsedMail(await simpleParser(m.source));
          if (p) parsed.push(p);
        }
        const summary = await ingestEmails(parsed, { myAddresses: config.myAddresses, contacts: contactRefs });
        result.imported += summary.imported;
        result.duplicates += summary.duplicates;
        result.skipped += summary.skipped;
        result.threadsCreated += summary.threadsCreated;

        const sameValidity = state?.uidValidity === fetched.uidValidity;
        const maxUid = Math.max(sameValidity ? state!.lastUid : 0, ...fetched.messages.map((m) => m.uid));
        await setState(key, { uidValidity: fetched.uidValidity, lastUid: maxUid });
        result.mailboxes.push({ name: mailbox, fetched: fetched.messages.length });
      } catch (e) {
        result.mailboxes.push({ name: mailbox, fetched: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    await source.close();
  }
  await setState(LAST_RUN_KEY, result);
  return result;
}

async function setState(key: string, value: unknown) {
  await db
    .insert(appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
}

export async function lastEmailSync(): Promise<SyncResult | null> {
  const row = await db.query.appState.findFirst({ where: eq(appState.key, LAST_RUN_KEY) });
  return (row?.value as SyncResult | undefined) ?? null;
}

/** IMAP implementation (any standard server). */
export async function imapSource(config: EmailConfig): Promise<MailSource> {
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });
  await client.connect();
  return {
    async fetch(mailbox, state, since, limit) {
      const lock = await client.getMailboxLock(mailbox, { readOnly: true });
      try {
        const box = client.mailbox;
        const uidValidity = box && typeof box === "object" ? String(box.uidValidity) : "0";
        const resume = state && state.uidValidity === uidValidity;
        const uids = resume
          ? ((await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true })) || []).filter((u) => u > state.lastUid)
          : (await client.search({ since }, { uid: true })) || [];
        // Oldest first, so a capped run resumes where it stopped.
        const batch = [...uids].sort((a, b) => a - b).slice(0, limit);
        const out: FetchedMail[] = [];
        if (batch.length) {
          for await (const msg of client.fetch(batch.join(","), { uid: true, source: true }, { uid: true })) {
            if (msg.source) out.push({ uid: msg.uid, source: msg.source });
          }
        }
        return { uidValidity, messages: out };
      } finally {
        lock.release();
      }
    },
    async close() {
      await client.logout().catch(() => {});
    },
  };
}
