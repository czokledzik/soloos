import "server-only";
import { timingSafeEqual } from "node:crypto";

/** The local runner authenticates with AI_RUNNER_TOKEN (24+ chars). */
export function runnerAuthorized(req: Request): boolean {
  const token = process.env.AI_RUNNER_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token || token.length < 24) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
