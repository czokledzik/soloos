import { claimJob } from "@/server/ai/run";
import { runnerAuthorized } from "@/server/ai/runner-auth";

export const dynamic = "force-dynamic";

/** The local runner asks for work: returns the next job (prompt + JSON schema), or 204. */
export async function POST(req: Request) {
  if (!runnerAuthorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const job = await claimJob();
  return job ? Response.json(job) : new Response(null, { status: 204 });
}
