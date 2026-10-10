import { readClient } from "@/server/mcp/oauth";

type Params = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Checks an authorization request; returns an error to show (never redirected to an unchecked URI). */
export function checkRequest(sp: Params) {
  const client = readClient(one(sp.client_id));
  if (!client) return { error: "Unknown client. Remove the connector and add it again." } as const;
  if (!client.redirect_uris.includes(one(sp.redirect_uri))) return { error: "redirect_uri isn't registered for this client." } as const;
  if (one(sp.response_type) !== "code") return { error: "Only response_type=code is supported." } as const;
  if (one(sp.code_challenge_method) !== "S256" || !one(sp.code_challenge)) {
    return { error: "PKCE with S256 is required." } as const;
  }
  return { client } as const;
}

