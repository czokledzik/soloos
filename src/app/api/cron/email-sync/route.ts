import { timingSafeEqual } from "node:crypto";
import { emailConfig, imapSource, runEmailSync } from "@/server/email-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Email sync for a scheduler (Vercel Cron, GitHub Actions, cron + curl).
 * Requires `Authorization: Bearer $CRON_SECRET`; Vercel Cron sends it automatically.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(given, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const config = emailConfig();
  if (!config) return Response.json({ error: "Email sync isn't configured (IMAP_HOST, IMAP_USER, IMAP_PASSWORD)" }, { status: 503 });
  const result = await runEmailSync(config, await imapSource(config));
  return Response.json(result);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
