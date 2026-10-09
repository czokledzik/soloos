import { parseCurrency, parseMoney } from "@/lib/format";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Helpers for reading typed values out of FormData. Empty strings become null. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function reqStr(fd: FormData, key: string): string {
  const v = str(fd, key);
  if (!v) throw new ActionError(`${key} is required`);
  return v;
}

export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function money(fd: FormData, key: string): number | null {
  return parseMoney(fd.get(key));
}

/** Currency code, upper-cased; defaults to PLN when empty, rejects anything else. */
export function currency(fd: FormData, key = "currency"): string {
  const raw = str(fd, key);
  if (raw == null) return "PLN";
  const code = parseCurrency(raw);
  if (!code) throw new ActionError(`"${raw}" isn't a currency code (use e.g. PLN, EUR, USD)`);
  return code;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function oneOf<T extends string>(fd: FormData, key: string, values: readonly T[]): T | null {
  const v = str(fd, key);
  return v && (values as readonly string[]).includes(v) ? (v as T) : null;
}

export class ActionError extends Error {}

/** Wrap an action body so validation errors come back as { ok: false }. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong" };
  }
}
