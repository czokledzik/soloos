import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeMcp } from "@/server/mcp/oauth";
import { createMcpServer } from "@/server/mcp/server";
import { cors, originOf } from "@/server/mcp/urls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP over Streamable HTTP, stateless: every request gets a fresh server and
 * transport. Auth: OAuth access token (Claude connectors) or MCP_TOKEN (Claude Code).
 */
async function handle(req: Request) {
  if (!authorizeMcp(req.headers.get("authorization"))) {
    const origin = originOf(req);
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
      },
    });
  }
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  } finally {
    // Stateless: nothing to keep around once the response is produced.
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
