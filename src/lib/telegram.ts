/**
 * Parses a Telegram Desktop export (Settings → Advanced → Export Telegram data,
 * format "Machine-readable JSON"). Accepts both a single-chat export and a full
 * account export with `chats.list`.
 */

export type TelegramMessage = {
  id: number;
  fromId: string; // "user123" / "channel456"
  fromName: string;
  sentAt: Date;
  body: string;
};

export type TelegramChat = {
  id: number;
  name: string;
  type: string;
  messages: TelegramMessage[];
  participants: { handle: string; name: string; count: number }[];
};

export type TelegramExport = {
  chats: TelegramChat[];
  /** The exporting account's `from_id` ("user123"), when the export includes personal info. */
  meId: string | null;
  errors: string[];
};

type RawText = string | (string | { type?: string; text?: string; href?: string })[];
type RawMessage = {
  id?: number;
  type?: string;
  date?: string;
  date_unixtime?: string;
  from?: string | null;
  from_id?: string;
  actor?: string;
  actor_id?: string;
  text?: RawText;
  photo?: string;
  file?: string;
  file_name?: string;
  media_type?: string;
  sticker_emoji?: string;
  forwarded_from?: string;
  poll?: { question?: string };
  location_information?: unknown;
  contact_information?: { first_name?: string; last_name?: string; phone_number?: string };
};
type RawChat = { id?: number; name?: string | null; type?: string; messages?: RawMessage[] };

export function textOf(text: RawText | undefined): string {
  if (text == null) return "";
  if (typeof text === "string") return text;
  return text
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text_link" && part.href && part.href !== part.text) return `[${part.text}](${part.href})`;
      return part.text ?? "";
    })
    .join("");
}

/** What a message shows for its attachments, e.g. "[photo]" or "[file: brief.pdf]". */
function attachment(m: RawMessage): string | null {
  if (m.photo) return "[photo]";
  if (m.media_type === "sticker") return m.sticker_emoji ? `[sticker ${m.sticker_emoji}]` : "[sticker]";
  if (m.media_type === "voice_message") return "[voice message]";
  if (m.media_type === "video_message") return "[video message]";
  if (m.media_type === "animation") return "[GIF]";
  if (m.media_type === "video_file") return "[video]";
  if (m.media_type === "audio_file") return "[audio]";
  if (m.file || m.file_name) {
    const name = m.file_name ?? m.file?.split("/").pop();
    return name && !name.startsWith("(") ? `[file: ${name}]` : "[file]";
  }
  if (m.poll) return `[poll: ${m.poll.question ?? ""}]`;
  if (m.location_information) return "[location]";
  if (m.contact_information) {
    const c = m.contact_information;
    return `[contact: ${[c.first_name, c.last_name].filter(Boolean).join(" ")} ${c.phone_number ?? ""}]`.replace(/\s+]/, "]");
  }
  return null;
}

function sentAt(m: RawMessage): Date | null {
  if (m.date_unixtime && /^\d+$/.test(m.date_unixtime)) return new Date(Number(m.date_unixtime) * 1000);
  // Older exports only have local time without a zone.
  if (m.date) {
    const d = new Date(m.date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function parseChat(raw: RawChat, errors: string[]): TelegramChat | null {
  if (typeof raw.id !== "number" || !Array.isArray(raw.messages)) return null;
  const name = raw.name?.trim() || (raw.type === "saved_messages" ? "Saved messages" : `Chat ${raw.id}`);
  const messages: TelegramMessage[] = [];
  const people = new Map<string, { handle: string; name: string; count: number }>();
  let bad = 0;

  for (const m of raw.messages) {
    if (m.type !== "message" || typeof m.id !== "number" || !m.from_id) continue;
    const at = sentAt(m);
    if (!at) {
      bad++;
      continue;
    }
    const parts = [m.forwarded_from ? `Forwarded from ${m.forwarded_from}:` : null, textOf(m.text), attachment(m)];
    const body = parts.filter((p) => p && p.trim()).join("\n");
    if (!body) continue;
    const fromName = m.from?.trim() || "Deleted account";
    messages.push({ id: m.id, fromId: m.from_id, fromName, sentAt: at, body });
    const p = people.get(m.from_id) ?? { handle: m.from_id, name: fromName, count: 0 };
    p.count++;
    p.name = fromName; // latest display name wins
    people.set(m.from_id, p);
  }
  if (bad) errors.push(`${name}: ${bad} message(s) without a readable date were skipped`);
  return { id: raw.id, name, type: raw.type ?? "unknown", messages, participants: [...people.values()] };
}

export function parseTelegramExport(json: string): TelegramExport {
  let data: unknown;
  try {
    data = JSON.parse(json.replace(/^﻿/, ""));
  } catch {
    return { chats: [], meId: null, errors: ["Not a JSON file. Export with format “Machine-readable JSON”."] };
  }
  const errors: string[] = [];
  const root = data as { chats?: { list?: RawChat[] }; personal_information?: { user_id?: number } } & RawChat;
  const rawChats: RawChat[] = Array.isArray(root.chats?.list) ? root.chats.list : root.messages ? [root] : [];
  if (rawChats.length === 0) {
    return { chats: [], meId: null, errors: ["No chats found. Is this a Telegram Desktop export (result.json)?"] };
  }
  const chats = rawChats
    .map((c) => parseChat(c, errors))
    .filter((c): c is TelegramChat => c != null && c.messages.length > 0);
  const userId = root.personal_information?.user_id;
  return { chats, meId: userId != null ? `user${userId}` : guessMe(chats), errors };
}

/** Without personal info, "me" is whoever appears in the most chats (the exporter is in all of them). */
function guessMe(chats: TelegramChat[]): string | null {
  if (chats.length < 2) return null;
  const seen = new Map<string, number>();
  for (const c of chats) for (const p of c.participants) seen.set(p.handle, (seen.get(p.handle) ?? 0) + 1);
  const everywhere = [...seen].filter(([, n]) => n === chats.length);
  return everywhere.length === 1 ? everywhere[0][0] : null;
}
