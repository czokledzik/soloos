import { cors, originOf, resourceMetadata } from "@/server/mcp/urls";

// RFC 9728: tells MCP clients which authorization server protects /api/mcp.
export function GET(req: Request) {
  return Response.json(resourceMetadata(originOf(req)), { headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
