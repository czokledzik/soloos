import { OAuthError, exchangeCode, readClient, refresh } from "@/server/mcp/oauth";
import { cors } from "@/server/mcp/urls";

/** OAuth token endpoint: authorization_code (with PKCE) and refresh_token grants. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return error("invalid_request", "Expected application/x-www-form-urlencoded");
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  try {
    const grant = get("grant_type");
    if (grant === "authorization_code") {
      const clientId = get("client_id");
      if (!readClient(clientId)) return error("invalid_client", "Unknown client", 401);
      const tokens = exchangeCode({
        code: get("code"),
        codeVerifier: get("code_verifier"),
        clientId,
        redirectUri: get("redirect_uri"),
      });
      return json(tokens);
    }
    if (grant === "refresh_token") {
      return json(refresh({ refreshToken: get("refresh_token"), clientId: get("client_id") || undefined }));
    }
    return error("unsupported_grant_type", `Unsupported grant_type "${grant}"`);
  } catch (e) {
    if (e instanceof OAuthError) return error(e.code, e.message);
    throw e;
  }
}

function json(body: object) {
  return Response.json(body, { headers: { ...cors, "Cache-Control": "no-store" } });
}

function error(code: string, description: string, status = 400) {
  return Response.json({ error: code, error_description: description }, { status, headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
