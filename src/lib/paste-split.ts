/**
 * Splits a pasted conversation into messages. Recognizes the usual copy/export
 * formats; anything it can't read becomes a single message, to be fixed by hand
 * on the paste-and-fix screen.
 *
 *   WhatsApp export   "05.10.2026, 14:32 - Anna Nowak: text"  /  "[05.10.2026, 14:32:10] Anna: text"
 *                     "10/5/26, 2:32 PM - Anna: text"
 *   Telegram copy     "Anna Nowak, [05.10.2026 14:32]"  then the text on the next lines
 *   Messenger copy    a sender line ("Anna Nowak", "You sent") repeated above each block
 *   Chat log          "Anna: text"  /  "[14:32] Anna: text"
 */

export type SplitMessage = {
  sender: string;
  /** Local date-time "yyyy-MM-ddTHH:mm", or null if the paste had none. */
  at: string | null;
  body: string;
};

export type SplitResult = { messages: SplitMessage[]; senders: string[]; format: SplitFormat };
export type SplitFormat = "whatsapp" | "telegram" | "messenger" | "chat" | "none";

/** What the pasted "me" lines are called in Messenger copies. */
export const ME = "Me";

const pad = (n: number) => String(n).padStart(2, "0");

function toAt(d: number, m: number, y: number, h: number, min: number, ampm?: string): string | null {
  if (y < 100) y += 2000;
  const a = ampm?.toLowerCase();
  if (a === "pm" && h < 12) h += 12;
  if (a === "am" && h === 12) h = 0;
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`;
}

/** Day-first unless the first number can't be a month ("10/25/26") or AM/PM suggests US style. */
function dateFrom(a: number, b: number, y: number, h: number, min: number, ampm?: string) {
  const monthFirst = b > 12 || (ampm != null && a <= 12);
  return monthFirst ? toAt(b, a, y, h, min, ampm) : toAt(a, b, y, h, min, ampm);
}

const DATE = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?`;

const WHATSAPP = new RegExp(String.raw`^\[?${DATE},?\s+${TIME}\]?\s*(?:-\s*)?([^:]{1,60}?):\s?(.*)$`);
const TELEGRAM = new RegExp(String.raw`^(.{1,60}?),\s*\[${DATE}\s+${TIME}\]\s*$`);
const CHAT = /^(?:\[(\d{1,2}):(\d{2})(?::\d{2})?\]\s*)?([\p{L}][\p{L}\p{M} .'-]{0,40}?):\s+(.*)$/u;
const MESSENGER_ME = /^(you sent|ty:|wysłano|you)$/i;

export function splitConversation(text: string, fallbackDate?: string): SplitResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return { messages: [], senders: [], format: "none" };

  const attempts: [SplitFormat, (lines: string[], date?: string) => SplitMessage[] | null][] = [
    ["whatsapp", splitWhatsApp],
    ["telegram", splitTelegram],
    ["chat", splitChat],
    ["messenger", splitMessenger],
  ];
  for (const [format, fn] of attempts) {
    const messages = fn(lines, fallbackDate);
    if (messages && messages.length > 1) return finish(messages, format);
  }
  return finish([{ sender: "", at: null, body: text.trim() }], "none");
}

function finish(messages: SplitMessage[], format: SplitFormat): SplitResult {
  const cleaned = messages
    .map((m) => ({ ...m, sender: m.sender.trim(), body: m.body.replace(/\n+$/, "").replace(/^\n+/, "") }))
    .filter((m) => m.body.trim());
  const senders = [...new Set(cleaned.map((m) => m.sender).filter(Boolean))];
  return { messages: cleaned, senders, format };
}

/** Collects lines into messages: a header line starts a message, other lines continue it. */
function collect(
  lines: string[],
  header: (line: string) => { sender: string; at: string | null; first: string } | null,
  minHeaderShare = 0,
): SplitMessage[] | null {
  const out: SplitMessage[] = [];
  let headers = 0;
  for (const line of lines) {
    const h = header(line);
    if (h) {
      headers++;
      out.push({ sender: h.sender, at: h.at, body: h.first });
    } else if (out.length) {
      out[out.length - 1].body += `\n${line}`;
    } else if (line.trim()) {
      // Text before the first header: keep it as an unattributed message.
      out.push({ sender: "", at: null, body: line });
    }
  }
  const content = lines.filter((l) => l.trim()).length;
  if (headers < 2 || headers / content < minHeaderShare) return null;
  return out;
}

function splitWhatsApp(lines: string[]) {
  return collect(lines, (line) => {
    const m = line.match(WHATSAPP);
    if (!m) return null;
    const at = dateFrom(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), m[6]);
    return at ? { sender: m[7], at, first: m[8] } : null;
  });
}

function splitTelegram(lines: string[]) {
  return collect(lines, (line) => {
    const m = line.trim().match(TELEGRAM);
    if (!m) return null;
    const at = dateFrom(Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), m[7]);
    return at ? { sender: m[1], at, first: "" } : null;
  });
}

function splitChat(lines: string[], date?: string) {
  // "Name: text" is common inside prose too, so require that most lines look like it
  // and that the same few names repeat.
  const res = collect(
    lines,
    (line) => {
      const m = line.match(CHAT);
      if (!m) return null;
      if (/^(https?|mailto|tel|re|fwd|subject|temat|od|from|to|do|cc)$/i.test(m[3].trim())) return null;
      const at = m[1] && date ? `${date}T${pad(Number(m[1]))}:${m[2]}` : null;
      return { sender: m[3], at, first: m[4] };
    },
    0.5,
  );
  if (!res) return null;
  const names = new Set(res.map((r) => r.sender).filter(Boolean));
  return names.size <= 6 && res.length >= names.size * 1.5 ? res : null;
}

function splitMessenger(lines: string[]) {
  // A sender line is a short name-like line that repeats as a header (or "You sent").
  const nameLike = (l: string) => /^[\p{Lu}][\p{L}\p{M}.'-]*(?: [\p{L}\p{M}.'-]+){0,3}$/u.test(l) && l.length <= 40;
  const counts = new Map<string, number>();
  lines.forEach((raw, i) => {
    const l = raw.trim();
    const next = lines[i + 1]?.trim();
    if (next && (MESSENGER_ME.test(l) || nameLike(l))) counts.set(l, (counts.get(l) ?? 0) + 1);
  });
  const senders = new Set(
    [...counts].filter(([l, n]) => MESSENGER_ME.test(l) || n >= 2).map(([l]) => l),
  );
  if (senders.size === 0 || senders.size > 6) return null;
  return collect(lines, (line) => {
    const l = line.trim();
    if (!senders.has(l)) return null;
    return { sender: MESSENGER_ME.test(l) ? ME : l, at: null, first: "" };
  });
}
