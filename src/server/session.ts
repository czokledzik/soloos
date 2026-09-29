import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Single-user password auth. Set APP_PASSWORD to turn it on (required in
 * production). The session cookie is `<expiry>.<hmac>`, signed with the
 * password, so changing the password logs every device out.
 */
export const SESSION_COOKIE = "soloos_session";
export const SESSION_DAYS = 30;

export const appPassword = () => process.env.APP_PASSWORD || null;

const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input: string) {
  const password = appPassword();
  // Compare digests so the check doesn't leak the password length.
  return password != null && safeEqual(hmac("pw", input), hmac("pw", password));
}

export function createSession() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return { value: `${expires}.${hmac(appPassword()!, `session:${expires}`)}`, expires: new Date(expires) };
}

export function verifySession(value: string | undefined) {
  const password = appPassword();
  if (!password || !value) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, hmac(password, `session:${expires}`));
}
