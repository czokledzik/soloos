import "server-only";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, opportunities } from "@/db";
import { listChangeRequests, listDecisions } from "../doc-queries";
import { getThread, listThreads } from "../message-queries";
import { getProject, listProjectTasks } from "../queries";

/** The longest stretch of a thread sent to Claude; older messages are left out (and the prompt says so). */
export const MAX_THREAD_MESSAGES = 400;

export const SYSTEM = `You help a freelance developer run their projects in SoloOS, their personal ops app.
You get raw material (chat messages, project notes) and return structured suggestions. The user reviews each suggestion and decides what to keep, so only suggest what the material supports; leave lists empty rather than padding them.
Write in the language the conversation is in (often Polish). Be concise and concrete. Never include credentials.`;

const nullableString = z.string().nullable();

export const schemas = {
  thread_insights: z.object({
    summary: z.string().describe("3-6 sentences: what this conversation is about and where it stands"),
    decisions: z
      .array(
        z.object({
          title: z.string().describe("The decision as one sentence"),
          details: z.string().describe("Why / context, may be empty"),
          decidedBy: nullableString.describe("Who decided, as named in the chat"),
          decidedOn: nullableString.describe("yyyy-MM-dd of the message where it was agreed"),
          sourceMessageId: z.number().int().nullable().describe("[id] of the message it came from"),
        }),
      )
      .describe("Things clearly agreed, not ideas still being discussed"),
    changeRequests: z
      .array(
        z.object({
          title: z.string(),
          details: z.string(),
          requestedBy: nullableString,
          hoursImpact: nullableString.describe("Signed estimate like '+6h' or '-1:30' if stated or clearly implied, else null"),
          priceImpact: z.number().nullable().describe("Signed amount in major currency units if stated, else null"),
          sourceMessageId: z.number().int().nullable(),
        }),
      )
      .describe("Requests that change the agreed scope (only relevant when a scope is given)"),
    tasks: z
      .array(z.object({ title: z.string(), dueDate: nullableString.describe("yyyy-MM-dd if a date was given") }))
      .describe("Concrete things the user has to do"),
    openQuestions: z.array(z.string()).describe("Questions the client asked that are still unanswered"),
    replyDraft: nullableString.describe("A reply the user could send next, if one is due; null if nothing needs an answer"),
  }),
  project_brief: z.object({
    briefMd: z
      .string()
      .describe("Markdown brief: what the project is, for whom, what done looks like, key constraints. Under 150 words."),
  }),
  lead_reply: z.object({
    replyMd: z.string().describe("A short, friendly first reply to the post, ready to send"),
    questions: z.array(z.string()).describe("What to clarify before quoting"),
  }),
} as const;

export type AiKind = keyof typeof schemas;
export type AiResult<K extends AiKind> = z.infer<(typeof schemas)[K]>;

const when = (d: Date) => format(d, "yyyy-MM-dd HH:mm");

async function projectContext(projectId: number) {
  const p = await getProject(projectId);
  if (!p) return null;
  const [decs, crs] = await Promise.all([listDecisions(projectId), listChangeRequests(projectId)]);
  return [
    `Project: ${p.name} (client: ${p.org.name}, status: ${p.status}, pricing: ${p.pricing})`,
    p.briefMd && `Brief:\n${p.briefMd}`,
    p.scopeMd && `Agreed scope${p.scopeBaselinedAt ? "" : " (not baselined yet)"}:\n${p.scopeMd}`,
    decs.length > 0 && `Decisions already logged:\n${decs.map((d) => `- ${d.decidedOn}: ${d.title}`).join("\n")}`,
    crs.length > 0 && `Change requests already logged:\n${crs.map((c) => `- ${c.title} (${c.status})`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Builds the prompt for a job, or throws if the subject is gone. */
export async function buildPrompt(kind: AiKind, subjectId: number): Promise<string> {
  if (kind === "thread_insights") {
    const t = await getThread(subjectId);
    if (!t) throw new Error("Thread not found");
    const msgs = t.messages.slice(-MAX_THREAD_MESSAGES);
    const cut = t.messages.length - msgs.length;
    const ctx = t.projectId ? await projectContext(t.projectId) : null;
    return [
      `Conversation "${t.title || "untitled"}" on ${t.channel} with ${t.orgName}.`,
      ctx ? `Context:\n${ctx}` : "This thread isn't linked to a project, so there's no agreed scope: leave changeRequests empty.",
      cut > 0 ? `Only the latest ${msgs.length} of ${t.messages.length} messages are included.` : null,
      `Messages ("Me" is the user):\n${msgs.map((m) => `[${m.id}] ${when(m.sentAt)} ${m.isMe ? "Me" : m.sender || "Unknown"}: ${m.bodyMd}`).join("\n")}`,
      "Don't repeat decisions or change requests that are already logged.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (kind === "project_brief") {
    const ctx = await projectContext(subjectId);
    if (!ctx) throw new Error("Project not found");
    const [tasks, threads] = await Promise.all([listProjectTasks(subjectId), listThreads({ projectId: subjectId }, 60)]);
    const p = (await getProject(subjectId))!;
    return [
      "Write (or rewrite) this project's brief.",
      ctx,
      p.notesMd && `Notes:\n${p.notesMd}`,
      tasks.length > 0 && `Tasks:\n${tasks.map((t) => `- [${t.status}] ${t.title}`).join("\n")}`,
      ...threads.map(
        (t) =>
          `Recent messages in "${t.title || t.channel}":\n${t.messages
            .map((m) => `${when(m.sentAt)} ${m.isMe ? "Me" : m.sender}: ${m.bodyMd}`)
            .join("\n")}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const opp = await db.query.opportunities.findFirst({ where: eq(opportunities.id, subjectId), with: { org: true } });
  if (!opp) throw new Error("Lead not found");
  return [
    "Draft a first reply to this lead. The user is a freelance developer (automation with n8n, web apps, AI agents).",
    `Lead: ${opp.title} (${opp.org.name}${opp.sourceDetail ? `, from ${opp.sourceDetail}` : ""})`,
    `Their post:\n${opp.originalPostMd || "(no post saved)"}`,
  ].join("\n\n");
}
