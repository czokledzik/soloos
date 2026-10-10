import { registerClient, validRedirectUri } from "@/server/mcp/oauth";
import { cors } from "@/server/mcp/urls";

/** RFC 7591 dynamic client registration (stateless: the client id carries its redirect URIs). */
export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD) return error("Set APP_PASSWORD to enable MCP connectors", 503);
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = await req.json();
  } catch {
    return error("Body must be JSON");
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
    return error("redirect_uris must be https URLs (or http on localhost)", 400, "invalid_redirect_uri");
  }
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : undefined;
  const client_id = registerClient({ redirect_uris: uris, client_name: name });
  return Response.json(
    {
      client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: cors },
  );
}

function error(description: string, status = 400, code = "invalid_client_metadata") {
  return Response.json({ error: code, error_description: description }, { status, headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
