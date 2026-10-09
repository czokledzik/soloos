import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Minimal, stateless OAuth 2.1 for the MCP endpoint (single user). Client ids,
 * authorization codes and tokens are signed blobs: nothing is stored, and
 * changing APP_PASSWORD (or MCP_SECRET) invalidates all of them, like sessions.
 *
 * Supports what Claude's connectors need: dynamic client registration, the
 * authorization-code flow with PKCE (S256), and refresh tokens.
 */

const CODE_TTL_S = 5 * 60;
export const ACCESS_TTL_S = 24 * 60 * 60;
const REFRESH_TTL_S = 90 * 24 * 60 * 60;

type Kind = "client" | "code" | "access" | "refresh";

function secret(): string | null {
  const s = process.env.MCP_SECRET || process.env.APP_PASSWORD;
  return s ? `mcp:${s}` : null;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

function sign(kind: Kind, payload: object): string {
  const key = secret();
  if (!key) throw new Error("APP_PASSWORD is not set");
  const body = b64(JSON.stringify({ ...payload, k: kind }));
  return `${body}.${createHmac("sha256", key).update(`${kind}.${body}`).digest("base64url")}`;
}

function verify<T>(kind: Kind, token: string | null | undefined): T | null {
  const key = secret();
  if (!key || !token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", key).update(`${kind}.${body}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64(body)) as T & { k: Kind; exp?: number };
    if (data.k !== kind) return null;
    if (data.exp != null && data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

const now = () => Math.floor(Date.now() / 1000);

// ---------- Clients (dynamic registration) ----------

export type OAuthClient = { redirect_uris: string[]; client_name?: string };

/** Only https redirects, plus http on localhost for local tools. */
export function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function registerClient(client: OAuthClient): string {
  return sign("client", { redirect_uris: client.redirect_uris, client_name: client.client_name });
}

export function readClient(clientId: string | null | undefined): OAuthClient | null {
  return verify<OAuthClient>("client", clientId);
}

// ---------- Authorization codes ----------

type CodePayload = { cid: string; ru: string; cc: string; scope: string; exp: number; n: string };

export function issueCode(p: { clientId: string; redirectUri: string; codeChallenge: string; scope?: string }) {
  // The client id is long; store a hash of it.
  return sign("code", {
    cid: hash(p.clientId),
    ru: p.redirectUri,
    cc: p.codeChallenge,
    scope: p.scope ?? "",
    exp: now() + CODE_TTL_S,
    n: randomBytes(8).toString("hex"),
  } satisfies CodePayload);
}

const hash = (s: string) => createHash("sha256").update(s).digest("base64url");

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

function tokens(clientIdHash: string, scope: string): TokenResponse {
  return {
    access_token: sign("access", { cid: clientIdHash, scope, exp: now() + ACCESS_TTL_S }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    refresh_token: sign("refresh", { cid: clientIdHash, scope, exp: now() + REFRESH_TTL_S }),
    scope,
  };
}

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function exchangeCode(p: { code: string; codeVerifier: string; clientId: string; redirectUri: string }) {
  const c = verify<CodePayload>("code", p.code);
  if (!c) throw new OAuthError("invalid_grant", "Authorization code is invalid or expired");
  if (c.cid !== hash(p.clientId)) throw new OAuthError("invalid_grant", "Code was issued to another client");
  if (c.ru !== p.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri doesn't match");
  if (!p.codeVerifier || hash(p.codeVerifier) !== c.cc) throw new OAuthError("invalid_grant", "PKCE verification failed");
  return tokens(c.cid, c.scope);
}

export function refresh(p: { refreshToken: string; clientId?: string }) {
  const r = verify<{ cid: string; scope: string }>("refresh", p.refreshToken);
  if (!r) throw new OAuthError("invalid_grant", "Refresh token is invalid or expired");
  if (p.clientId && r.cid !== hash(p.clientId)) throw new OAuthError("invalid_grant", "Token was issued to another client");
  return tokens(r.cid, r.scope);
}

// ---------- Checking requests ----------

/**
 * Whether a request to the MCP endpoint is allowed: a valid OAuth access token
 * or the static MCP_TOKEN (for Claude Code). Local dev without a password is open,
 * like the rest of the app.
 */
export function authorizeMcp(authorization: string | null): boolean {
  if (!process.env.APP_PASSWORD) return process.env.NODE_ENV !== "production";
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return false;
  const staticToken = process.env.MCP_TOKEN;
  if (staticToken && staticToken.length >= 24) {
    const a = Buffer.from(token);
    const b = Buffer.from(staticToken);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return verify("access", token) != null;
}
