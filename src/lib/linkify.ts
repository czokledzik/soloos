export type TextPart = { text: string; href?: string };

const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

/**
 * Splits text into plain parts and links: markdown links "[text](url)" and bare
 * http(s) URLs. Only http(s) URLs become links, so pasted text can't smuggle in
 * `javascript:` hrefs.
 */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push(m[1] ? { text: m[1], href: m[2] } : { text: m[3], href: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
