"use server";

import { AiError, requestJob } from "./ai/run";
import type { AiKind } from "./ai/tasks";
import { ActionError, run } from "./form";
import { refreshAll } from "./refresh";

const KINDS: AiKind[] = ["thread_insights", "project_brief", "lead_reply"];

/** "Ask Claude" buttons: runs now (API) or queues for the runner. Returns the job. */
export async function askClaude(kind: AiKind, subjectId: number) {
  return run(async () => {
    if (!KINDS.includes(kind)) throw new ActionError("Unknown request");
    try {
      const job = await requestJob(kind, subjectId);
      refreshAll();
      return { id: job.id, status: job.status, error: job.error };
    } catch (e) {
      if (e instanceof AiError || (e instanceof Error && /not found/.test(e.message))) throw new ActionError(e.message);
      throw e;
    }
  });
}
