// Attachment rules shared by the upload form, the server actions and the download route.

/** Vercel rejects request bodies over 4.5 MB, so uploads stop just under that. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Types the browser may display in a tab. Everything else is served as a download. */
const INLINE: Record<string, (b: Uint8Array) => boolean> = {
  "application/pdf": (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]),
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/gif": (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]),
  "image/webp": (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
};

function startsWith(b: Uint8Array, sig: number[]) {
  return sig.every((x, i) => b[i] === x);
}

/**
 * The type to store for an upload: the browser's claim is only trusted for
 * viewable types when the bytes agree, so a renamed HTML file can't open inline.
 */
export function detectMimeType(claimed: string, bytes: Uint8Array): string {
  const type = claimed.split(";")[0].trim().toLowerCase();
  for (const [mime, check] of Object.entries(INLINE)) if (check(bytes)) return mime;
  if (INLINE[type]) return "application/octet-stream";
  return /^[a-z]+\/[a-z0-9.+-]+$/.test(type) ? type : "application/octet-stream";
}

export function isInline(mimeType: string): boolean {
  return mimeType in INLINE;
}

const TEXT_EXT = /\.(txt|md|csv|tsv|json|ya?ml|xml|ini|conf|cfg|env|toml|sh|js|ts|py|sql|log|html?)$/i;

/** Text files get the same credential check as notes; binary formats can't be read here. */
export function isTextFile(name: string, mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    /^application\/(json|xml|x-yaml|yaml|x-sh|sql|toml)$/.test(mimeType) ||
    TEXT_EXT.test(name) ||
    /^\.env/i.test(name)
  );
}

/** Content-Disposition with a UTF-8 filename (Polish letters) and an ASCII fallback. */
export function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
