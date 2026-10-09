import "server-only";
import { inArray } from "drizzle-orm";
import type { AddressObject, ParsedMail } from "mailparser";
import { db, messages, threads } from "@/db";
import { saveThread } from "./threads";

export type Addr = { address: string; name: string };
export type ParsedEmail = {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  date: Date;
  from: Addr[];
  to: Addr[];
  cc: Addr[];
  text: string;
};

const cleanId = (id: string) => id.trim().replace(/^<|>$/g, "");

function addrs(a: AddressObject | AddressObject[] | undefined): Addr[] {
  const list = Array.isArray(a) ? a : a ? [a] : [];
  return list
    .flatMap((o) => o.value)
    .flatMap((v) => (v.group ? v.group : [v]))
    .filter((v): v is { address: string; name: string } => Boolean(v.address))
    .map((v) => ({ address: v.address.toLowerCase(), name: v.name || v.address }));
}

/** Plain text of a message; HTML-only mail falls back to a crude tag strip. */
function bodyText(m: ParsedMail): string {
  if (m.text) return m.text;
  if (typeof m.html === "string") {
    return m.html
      .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n");
  }
  return "";
}

export function fromParsedMail(m: ParsedMail): ParsedEmail | null {
  const from = addrs(m.from);
  if (!m.messageId || from.length === 0) return null;
  const refs = Array.isArray(m.references) ? m.references : m.references ? m.references.split(/\s+/) : [];
  return {
    messageId: cleanId(m.messageId),
    inReplyTo: m.inReplyTo ? cleanId(m.inReplyTo.split(/\s+/)[0]) : null,
    references: refs.filter(Boolean).map(cleanId),
    subject: m.subject ?? "",
    date: m.date ?? new Date(),
    from,
    to: addrs(m.to),
    cc: addrs(m.cc),
    // Non-breaking spaces (from &nbsp;) would break search and look odd in plain text.
    text: bodyText(m).replace(/\u00a0/g, " "),
  };
}

/**
 * Drops the quoted history under a reply ("On … wrote:", "W dniu … napisał:",
 * Outlook headers, "> " lines) and a trailing signature after "-- ".
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next2 = `${line} ${lines[i + 1] ?? ""}`;
    const restQuoted = (from: number) => lines.slice(from).every((l) => /^\s*>/.test(l) || !l.trim());
    if (/^\s*>/.test(line) && restQuoted(i)) break;
    // Any "…:" header line followed only by quoted text ("W dniu … pisze:", "Le … a écrit :").
    if (/:\s*$/.test(line) && lines.slice(i + 1).some((l) => /^\s*>/.test(l)) && restQuoted(i + 1)) break;
    if (/^(On|W dniu|Dnia|Am|Le) .{4,200}(wrote|napisał\(a\)|napisała|napisał|pisze|schrieb|a écrit)\s*:\s*$/i.test(next2.trim())) break;
    if (/^(On|W dniu|Dnia) .{4,200}(wrote|napisał\(a\)|napisała|napisał|pisze)\s*:\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*(Original Message|Wiadomość oryginalna|Oryginalna wiadomość)\s*-{2,}/i.test(line.trim())) break;
    if (/^(From|Od):\s.+/i.test(line.trim()) && /^(Sent|Wysłano|Date|Data):\s/i.test((lines[i + 1] ?? "").trim())) break;
    if (line === "-- ") break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function normalizeSubject(s: string): string {
  return s.replace(/^\s*((re|fw|fwd|odp|pd|aw|wg)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
}

export type ContactRef = { id: number; orgId: number; emails: string[] };
export type IngestSummary = { imported: number; duplicates: number; skipped: number; threadsCreated: number };

/**
 * Stores emails that involve a known contact as thread messages. Replies join
 * their thread via In-Reply-To/References; everything is deduplicated by
 * Message-ID, so re-running a sync is harmless.
 */
export async function ingestEmails(
  emails: ParsedEmail[],
  opts: { myAddresses: string[]; contacts: ContactRef[] },
): Promise<IngestSummary> {
  const mine = new Set(opts.myAddresses.map((a) => a.toLowerCase()));
  const byAddress = new Map<string, ContactRef>();
  for (const c of opts.contacts) for (const e of c.emails) byAddress.set(e.toLowerCase(), c);

  const summary: IngestSummary = { imported: 0, duplicates: 0, skipped: 0, threadsCreated: 0 };
  const sorted = [...emails].sort((a, b) => a.date.getTime() - b.date.getTime());

  const ids = sorted.map((e) => `email:${e.messageId}`);
  const known = new Set(
    ids.length
      ? (await db.select({ key: messages.sourceKey }).from(messages).where(inArray(messages.sourceKey, ids))).map((r) => r.key)
      : [],
  );

  for (const e of sorted) {
    if (known.has(`email:${e.messageId}`)) {
      summary.duplicates++;
      continue;
    }
    const people = [...e.from, ...e.to, ...e.cc];
    const contact = people.map((p) => (mine.has(p.address) ? undefined : byAddress.get(p.address))).find(Boolean);
    if (!contact) {
      summary.skipped++;
      continue;
    }

    await db.transaction(async (tx) => {
      const refs = [e.inReplyTo, ...[...e.references].reverse()].filter((r): r is string => Boolean(r));
      let threadId: number | undefined;
      if (refs.length) {
        const hit = await tx
          .select({ threadId: messages.threadId, key: messages.sourceKey })
          .from(messages)
          .where(inArray(messages.sourceKey, refs.map((r) => `email:${r}`)));
        threadId = refs.map((r) => hit.find((h) => h.key === `email:${r}`)?.threadId).find(Boolean);
        if (!threadId) {
          const root = await tx
            .select({ id: threads.id, key: threads.sourceKey })
            .from(threads)
            .where(inArray(threads.sourceKey, refs.map((r) => `email:${r}`)));
          threadId = root[0]?.id;
        }
      }
      const unique = new Map(people.map((p) => [p.address, p]));
      const res = await saveThread(tx, {
        threadId,
        orgId: contact.orgId,
        channel: "email",
        title: normalizeSubject(e.subject) || "(no subject)",
        source: "email",
        sourceKey: threadId ? null : `email:${e.references[0] ?? e.inReplyTo ?? e.messageId}`,
        participants: [...unique.values()].map((p) => ({
          key: p.address,
          name: p.name,
          handle: p.address,
          isMe: mine.has(p.address),
        })),
        messages: [
          {
            participantKey: e.from[0].address,
            sentAt: e.date,
            body: stripQuoted(e.text) || "(no text)",
            sourceKey: `email:${e.messageId}`,
          },
        ],
      });
      if (res.created) summary.threadsCreated++;
      summary.imported += res.added;
    });
    known.add(`email:${e.messageId}`);
  }
  return summary;
}
