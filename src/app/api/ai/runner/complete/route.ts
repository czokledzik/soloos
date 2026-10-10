import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AiError, completeJob } from "@/server/ai/run";
import { runnerAuthorized } from "@/server/ai/runner-auth";

export const dynamic = "force-dynamic";

const body = z.object({ id: z.number().int().positive(), result: z.unknown().optional(), error: z.string().optional() });

/** The runner reports a result (checked against the job's schema) or an error. */
export async function POST(req: Request) {
  if (!runnerAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { id, result } or { id, error }" }, { status: 400 });
  try {
    const job = await completeJob(parsed.data.id, parsed.data);
    revalidatePath("/", "layout");
    return Response.json({ status: job.status, error: job.error });
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
