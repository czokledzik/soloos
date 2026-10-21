import type { NextRequest } from "next/server";
import { contentDisposition, isInline } from "@/lib/files";
import { getAttachmentFile } from "@/server/file-queries";

export const dynamic = "force-dynamic";

/** Serves an attachment behind the app login. `?download` forces a download even for PDFs and images. */
export async function GET(req: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const id = Number((await ctx.params).id);
  const file = Number.isInteger(id) ? await getAttachmentFile(id) : null;
  if (!file) return new Response("Not found", { status: 404 });
  const inline = isInline(file.mimeType) && !req.nextUrl.searchParams.has("download");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.length),
      "Content-Disposition": contentDisposition(file.name, inline),
      "Cache-Control": "private, no-store",
    },
  });
}
