import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeMcp, exchangeCode, issueCode, readClient, refresh, registerClient, validRedirectUri } from "./oauth";

const challenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const redirectUri = "https://claude.ai/api/mcp/auth_callback";

beforeEach(() => vi.stubEnv("APP_PASSWORD", "hunter2"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("OAuth", () => {
  it("registers clients statelessly", () => {
    const id = registerClient({ redirect_uris: [redirectUri], client_name: "Claude" });
    expect(readClient(id)).toEqual({ redirect_uris: [redirectUri], client_name: "Claude", k: "client" });
    expect(readClient(id.slice(0, -2) + "xx")).toBeNull();
    expect(readClient("nonsense")).toBeNull();
  });

  it("accepts only https or localhost redirect URIs", () => {
    expect(validRedirectUri(redirectUri)).toBe(true);
    expect(validRedirectUri("http://localhost:6274/callback")).toBe(true);
    expect(validRedirectUri("http://evil.com/cb")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
    expect(validRedirectUri("https://x.com/cb#frag")).toBe(false);
  });

  it("runs the code flow with PKCE and issues usable tokens", () => {
    const clientId = registerClient({ redirect_uris: [redirectUri] });
    const code = issueCode({ clientId, redirectUri, codeChallenge: challenge("verifier-123") });
    const tokens = exchangeCode({ code, codeVerifier: "verifier-123", clientId, redirectUri });
    expect(tokens.token_type).toBe("Bearer");
    expect(authorizeMcp(`Bearer ${tokens.access_token}`)).toBe(true);
    // A refresh token isn't an access token.
    expect(authorizeMcp(`Bearer ${tokens.refresh_token}`)).toBe(false);

    const again = refresh({ refreshToken: tokens.refresh_token, clientId });
    expect(authorizeMcp(`Bearer ${again.access_token}`)).toBe(true);
  });

  it("rejects wrong verifiers, clients, redirect URIs and expired codes", () => {
    const clientId = registerClient({ redirect_uris: [redirectUri] });
    const other = registerClient({ redirect_uris: ["https://other.example/cb"] });
    const code = issueCode({ clientId, redirectUri, codeChallenge: challenge("v") });
    expect(() => exchangeCode({ code, codeVerifier: "wrong", clientId, redirectUri })).toThrow("PKCE");
    expect(() => exchangeCode({ code, codeVerifier: "v", clientId: other, redirectUri })).toThrow("another client");
    expect(() => exchangeCode({ code, codeVerifier: "v", clientId, redirectUri: "https://x/cb" })).toThrow("redirect_uri");

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60_000);
    expect(() => exchangeCode({ code, codeVerifier: "v", clientId, redirectUri })).toThrow("expired");
  });

  it("changing the password revokes tokens", () => {
    const clientId = registerClient({ redirect_uris: [redirectUri] });
    const code = issueCode({ clientId, redirectUri, codeChallenge: challenge("v") });
    const { access_token } = exchangeCode({ code, codeVerifier: "v", clientId, redirectUri });
    vi.stubEnv("APP_PASSWORD", "new password");
    expect(authorizeMcp(`Bearer ${access_token}`)).toBe(false);
  });

  it("accepts a long enough static MCP_TOKEN", () => {
    vi.stubEnv("MCP_TOKEN", "short");
    expect(authorizeMcp("Bearer short")).toBe(false);
    vi.stubEnv("MCP_TOKEN", "x".repeat(32));
    expect(authorizeMcp(`Bearer ${"x".repeat(32)}`)).toBe(true);
    expect(authorizeMcp(null)).toBe(false);
  });

  it("is open locally without a password, closed in production", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(authorizeMcp(null)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(authorizeMcp(null)).toBe(false);
  });
});
