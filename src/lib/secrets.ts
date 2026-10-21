/**
 * Spots things that look like credentials, so they don't end up in SoloOS
 * (the systems list holds links, never secrets). Returns what it found, or null.
 */
const PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, "a password inside a URL"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "an Anthropic API key"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/, "an OpenAI-style API key"],
  [/\bsk_[a-f0-9]{40,}\b/, "an ElevenLabs API key"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/, "a GitHub token"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
  [/\bSK[0-9a-f]{32}\b/, "a Twilio API key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JWT / API token"],
  [/(?:\b|_)(?:password|passwd|pwd|hasło|haslo|secret|api[_ -]?key|auth[_ -]?token|access[_ -]?token|token)\s*[:=]\s*\S{6,}/i, "a password or key"],
];

export function findSecret(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [re, what] of PATTERNS) if (re.test(text)) return what;
  return null;
}
