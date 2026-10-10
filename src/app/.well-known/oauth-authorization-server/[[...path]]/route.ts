import { authServerMetadata, cors, originOf } from "@/server/mcp/urls";

// RFC 8414 authorization server metadata.
export function GET(req: Request) {
  return Response.json(authServerMetadata(originOf(req)), { headers: cors });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
