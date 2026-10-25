import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";

/** 1234 minutes → "20:34" */
export function formatMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${m.toString().padStart(2, "0")}`;
}

/** 1234 minutes → "20.6h" */
export function formatHours(min: number, digits = 1): string {
  return `${(min / 60).toFixed(digits)}h`;
}

/** Elapsed seconds → "1:02:03" */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

/** Minor units → "1 234,50 zł" for PLN, "$1,234.50" / "€1,234.50" for other currencies */
export function formatMoney(minor: number | null | undefined, currency = "PLN"): string {
  if (minor == null) return "—";
  try {
    const locale = currency === "PLN" ? "pl-PL" : "en-US";
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);
  } catch {
    // Not an ISO currency code: show the number with whatever was entered.
    return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2 }).format(minor / 100)} ${currency}`;
  }
}

/** Amounts in several currencies → "$1,200.00 + 500,00 zł"; "—" when there are none. */
export function formatMoneyTotals(items: { amount: number | null; currency: string }[]): string {
  const sums = new Map<string, number>();
  for (const i of items) if (i.amount != null) sums.set(i.currency, (sums.get(i.currency) ?? 0) + i.amount);
  return sums.size ? [...sums].map(([cur, v]) => formatMoney(v, cur)).join(" + ") : "—";
}

/** "pln" → "PLN"; anything that isn't a 3-letter code → null. */
export function parseCurrency(input: string | null): string | null {
  const s = input?.trim().toUpperCase();
  return s && /^[A-Z]{3}$/.test(s) ? s : null;
}

/** "123.45" | "123,45" → 12345 minor units; empty → null */
export function parseMoney(input: FormDataEntryValue | null): number | null {
  if (input == null) return null;
  const s = String(input).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Minor units → "123.45" for form inputs */
export function moneyInput(minor: number | null | undefined): string {
  return minor == null ? "" : (minor / 100).toString();
}

/** "1:30" | "1.5" | "90m" | "1h 30m" → minutes */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (m && (m[1] || m[2])) {
    return Math.round(Number((m[1] ?? "0").replace(",", ".")) * 60) + Number(m[2] ?? 0);
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 60) : null;
}

export function formatDate(d: string | Date | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "—";
  return format(typeof d === "string" ? parseISO(d) : d, pattern);
}

export function relativeDay(d: string | Date): string {
  const date = typeof d === "string" ? parseISO(d) : d;
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE, d MMM");
}

export function ago(d: Date): string {
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** Date → "yyyy-MM-dd" in local time */
export function toDateString(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
