/**
 * Only allow local paths, so `?next=` can't redirect off-site. Browsers treat
 * a backslash like a slash, and drop tabs/newlines, so "/\evil.com" and
 * "/<tab>/evil.com" would both mean "//evil.com".
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  const normalized = next.replace(/[\t\n\r]/g, "").replace(/\\/g, "/");
  return normalized.startsWith("//") ? "/" : next;
}
