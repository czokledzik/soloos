import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { format } from "date-fns";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  channel,
  db,
  docPages,
  messages,
  opportunities,
  organizations,
  projects,
  threadParticipants,
  threads,
} from "@/db";
import { createTask } from "@/server/actions";
import { listFollowUps, listInteractions, listPipeline } from "@/server/crm-queries";
import { createDocPage, saveChangeRequest, saveDecision, saveDocPage, updateProjectBrief } from "@/server/doc-actions";
import { getDocPage, listChangeRequests, listDecisions, listDocPages, listSystems } from "@/server/doc-queries";
import type { ActionResult } from "@/server/form";
import { savePastedThread } from "@/server/message-actions";
import { getThread, listThreads } from "@/server/message-queries";
import { getOrganization, getProject, listPayments, listProjectTasks, listProjects } from "@/server/queries";
import { scopeTotals } from "@/lib/scope";
import { searchAll, snippet } from "@/server/search-queries";

const INSTRUCTIONS = `SoloOS is the user's personal ops app for freelance work: clients, leads, projects, tasks, time, payments, messages and project docs.
Money values are in minor units (grosze/cents) unless a field says otherwise; durations are minutes.
Start with \`search\` or \`list_projects\`, then \`get_project\` / \`get_client\` for full context. A project's brief is its short summary: read it first, keep it current with \`update_project_brief\`.
Record agreed decisions with \`log_decision\` and scope changes with \`add_change_request\` (never approve them yourself: the user does that).
To import a chat from a screenshot, transcribe it and call \`import_messages\`.
Never store credentials (passwords, API keys, tokens) in SoloOS: the server refuses them.`;

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Turns an action result into a tool result. */
function result<T>(res: ActionResult<T>, ok: (data: T | undefined) => unknown) {
  return res.ok ? text(ok(res.data)) : fail(res.error);
}

function fd(values: Record<string, string | number | null | undefined>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) if (v != null && v !== "") f.set(k, String(v));
  return f;
}

const day = (d: Date | null) => (d ? format(d, "yyyy-MM-dd HH:mm") : null);
const id = z.number().int().positive();

export function createMcpServer() {
  const server = new McpServer({ name: "soloos", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const read = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

  // ---------- Reading ----------

  server.registerTool(
    "search",
    {
      title: "Search SoloOS",
      description:
        "Search clients, contacts, projects, tasks, leads, messages, logged conversations, decisions and doc pages by text.",
      inputSchema: { query: z.string().min(2).describe("Words to look for") },
      annotations: read,
    },
    async ({ query }) => {
      const r = await searchAll(query);
      return text({
        ...r,
        messages: r.messages.map((m) => ({ ...m, sentAt: day(m.sentAt), body: snippet(m.body, query, 150) })),
        conversations: r.conversations.map((c) => ({ ...c, occurredAt: day(c.occurredAt), body: snippet(c.body, query, 150) })),
      });
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "Projects with client, status, pricing and hours tracked (this month and total).",
      inputSchema: {
        status: z.enum(["planned", "active", "paused", "done", "archived"]).optional().describe("Only this status"),
      },
      annotations: read,
    },
    async ({ status }) => {
      const rows = await listProjects();
      return text(
        rows
          .filter((r) => !status || r.project.status === status)
          .map((r) => ({
            id: r.project.id,
            name: r.project.name,
            client: { id: r.org.id, name: r.org.name },
            status: r.project.status,
            pricing: r.project.pricing,
            currency: r.project.currency,
            minutesThisMonth: r.monthMin,
            minutesTotal: r.totalMin,
            openTasks: r.openTasks,
            brief: r.project.briefMd.slice(0, 280) || null,
          })),
      );
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Project context",
      description:
        "Everything about one project: brief, scope and change requests, decisions, open tasks, payments, systems, doc pages and recent conversation.",
      inputSchema: { projectId: id },
      annotations: read,
    },
    async ({ projectId }) => {
      const project = await getProject(projectId);
      if (!project) return fail(`No project ${projectId}`);
      const [taskRows, payments, crs, decs, sys, pages, thr, notes] = await Promise.all([
        listProjectTasks(projectId),
        listPayments(projectId),
        listChangeRequests(projectId),
        listDecisions(projectId),
        listSystems(projectId),
        listDocPages(projectId),
        listThreads({ projectId }, 15),
        listInteractions({ projectId }),
      ]);
      const totals = scopeTotals(project, crs);
      return text({
        id: project.id,
        name: project.name,
        client: { id: project.org.id, name: project.org.name },
        status: project.status,
        pricing: project.pricing,
        currency: project.currency,
        hourlyRate: project.hourlyRate ?? project.org.defaultRate,
        fixedPrice: project.fixedPrice,
        priceWithApprovedChanges: totals.currentPrice,
        budgetHours: project.budgetHours,
        budgetMinutesWithApprovedChanges: totals.currentBudgetMin,
        minutesTracked: project.totalMin,
        dueDate: project.dueDate,
        brief: project.briefMd,
        scope: { text: project.scopeMd, baselinedAt: day(project.scopeBaselinedAt) },
        changeRequests: crs.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          requestedBy: c.requestedBy,
          requestedOn: c.requestedOn,
          hoursImpactMin: c.hoursImpactMin,
          priceImpact: c.priceImpact,
        })),
        decisions: decs.slice(0, 30).map((d) => ({
          id: d.id,
          decidedOn: d.decidedOn,
          title: d.title,
          decidedBy: d.decidedBy,
          details: d.detailsMd || undefined,
        })),
        openTasks: taskRows
          .filter((t) => t.status !== "done")
          .map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })),
        doneTasks: taskRows.filter((t) => t.status === "done").length,
        payments: payments.map((p) => ({ label: p.label, amount: p.amount, dueDate: p.dueDate, paidAt: p.paidAt })),
        systems: sys.map((s) => ({ kind: s.kind, name: s.name, url: s.url, notes: s.notes || undefined })),
        docPages: pages.map((p) => ({ id: p.id, title: p.title })),
        notes: project.notesMd || undefined,
        recentThreads: thr.map((t) => ({
          threadId: t.id,
          title: t.title,
          channel: t.channel,
          lastMessageAt: day(t.lastMessageAt),
          lastMessages: t.messages.slice(-15).map((m) => ({ id: m.id, at: day(m.sentAt), from: m.sender, text: m.bodyMd })),
        })),
        loggedConversations: notes.slice(0, 5).map((i) => ({
          id: i.id,
          at: day(i.occurredAt),
          channel: i.channel,
          title: i.title,
          text: i.bodyMd.slice(0, 1500),
        })),
      });
    },
  );

  server.registerTool(
    "get_client",
    {
      title: "Client context",
      description: "A client (organization) with contacts, projects, leads and recent conversation.",
      inputSchema: { clientId: id },
      annotations: read,
    },
    async ({ clientId }) => {
      const org = await getOrganization(clientId);
      if (!org) return fail(`No client ${clientId}`);
      const [projs, leads, thr, notes] = await Promise.all([
        db.select({ id: projects.id, name: projects.name, status: projects.status }).from(projects)
          .where(and(eq(projects.orgId, clientId), isNull(projects.archivedAt))),
        db.select({ id: opportunities.id, title: opportunities.title, stage: opportunities.stage, nextAction: opportunities.nextAction, nextActionAt: opportunities.nextActionAt })
          .from(opportunities).where(eq(opportunities.orgId, clientId)).orderBy(desc(opportunities.createdAt)),
        listThreads({ orgId: clientId }, 10),
        listInteractions({ orgId: clientId }),
      ]);
      return text({
        id: org.id,
        name: org.name,
        status: org.status,
        website: org.website,
        defaultRate: org.defaultRate,
        currency: org.currency,
        notes: org.notesMd || undefined,
        contacts: org.contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, emails: c.emails, phone: c.phone, telegram: c.telegram })),
        projects: projs,
        leads,
        recentThreads: thr.map((t) => ({
          threadId: t.id,
          title: t.title,
          channel: t.channel,
          lastMessages: t.messages.slice(-10).map((m) => ({ id: m.id, at: day(m.sentAt), from: m.sender, text: m.bodyMd })),
        })),
        loggedConversations: notes.slice(0, 5).map((i) => ({ id: i.id, at: day(i.occurredAt), title: i.title, text: i.bodyMd.slice(0, 1500) })),
      });
    },
  );

  server.registerTool(
    "recent_messages",
    {
      title: "Recent messages",
      description:
        "Messages received or sent since a date (default: the last 7 days), grouped by thread, to review what's new and turn it into tasks, decisions or change requests.",
      inputSchema: {
        since: z.string().optional().describe("ISO date or date-time; default 7 days ago"),
        clientId: id.optional(),
      },
      annotations: read,
    },
    async ({ since, clientId }) => {
      const from = since ? new Date(since) : new Date(Date.now() - 7 * 86_400_000);
      if (Number.isNaN(from.getTime())) return fail(`Can't read "${since}" as a date`);
      const rows = await db
        .select({
          id: messages.id,
          sentAt: messages.sentAt,
          body: messages.bodyMd,
          threadId: threads.id,
          threadTitle: threads.title,
          channel: threads.channel,
          clientId: threads.orgId,
          clientName: organizations.name,
          projectId: threads.projectId,
          leadId: threads.opportunityId,
          from: threadParticipants.name,
          isMe: threadParticipants.isMe,
        })
        .from(messages)
        .innerJoin(threads, eq(messages.threadId, threads.id))
        .innerJoin(organizations, eq(threads.orgId, organizations.id))
        .leftJoin(threadParticipants, eq(messages.participantId, threadParticipants.id))
        .where(and(gte(messages.sentAt, from), clientId ? eq(threads.orgId, clientId) : undefined))
        .orderBy(asc(messages.sentAt))
        .limit(500);
      const byThread = new Map<number, { threadId: number; title: string; channel: string; client: string; clientId: number; projectId: number | null; leadId: number | null; messages: unknown[] }>();
      for (const r of rows) {
        const t = byThread.get(r.threadId) ?? {
          threadId: r.threadId,
          title: r.threadTitle,
          channel: r.channel,
          client: r.clientName,
          clientId: r.clientId,
          projectId: r.projectId,
          leadId: r.leadId,
          messages: [],
        };
        t.messages.push({ id: r.id, at: day(r.sentAt), from: r.isMe ? "me" : (r.from ?? "unknown"), text: r.body });
        byThread.set(r.threadId, t);
      }
      return text({ since: day(from), threads: [...byThread.values()] });
    },
  );

  server.registerTool(
    "get_thread",
    {
      title: "Read a thread",
      description: "All messages in one conversation thread, oldest first.",
      inputSchema: { threadId: id },
      annotations: read,
    },
    async ({ threadId }) => {
      const t = await getThread(threadId);
      if (!t) return fail(`No thread ${threadId}`);
      return text({
        id: t.id,
        title: t.title,
        channel: t.channel,
        client: { id: t.orgId, name: t.orgName },
        projectId: t.projectId,
        leadId: t.opportunityId,
        participants: t.participants.map((p) => ({ name: p.name, contactId: p.contactId, isMe: p.isMe })),
        messages: t.messages.map((m) => ({ id: m.id, at: day(m.sentAt), from: m.sender, text: m.bodyMd })),
      });
    },
  );

  server.registerTool(
    "get_doc_page",
    {
      title: "Read a doc page",
      description: "A project doc page (markdown, may include ```mermaid diagrams).",
      inputSchema: { pageId: id },
      annotations: read,
    },
    async ({ pageId }) => {
      const p = await getDocPage(pageId);
      if (!p) return fail(`No doc page ${pageId}`);
      return text({ id: p.id, projectId: p.projectId, title: p.title, body: p.bodyMd, revisions: p.revisions.length });
    },
  );

  server.registerTool(
    "list_pipeline",
    {
      title: "Sales pipeline",
      description: "Open leads by stage with their next action, plus follow-ups that are due.",
      annotations: read,
    },
    async () => {
      const [rows, due] = await Promise.all([listPipeline(), listFollowUps()]);
      return text({
        leads: rows
          .filter((r) => r.stage !== "won" && r.stage !== "lost")
          .map((r) => ({
            id: r.id,
            title: r.title,
            client: r.orgName,
            clientId: r.orgId,
            stage: r.stage,
            estimatedValue: r.estValue,
            nextAction: r.nextAction,
            nextActionAt: r.nextActionAt,
            lastContactAt: day(r.lastContactAt),
          })),
        followUpsDue: due,
      });
    },
  );

  // ---------- Writing ----------

  server.registerTool(
    "update_project_brief",
    {
      title: "Update project brief",
      description: "Replace a project's brief: a short summary of what the project is, for whom and what done looks like.",
      inputSchema: { projectId: id, briefMd: z.string().max(5000) },
      annotations: { ...write, idempotentHint: true },
    },
    async ({ projectId, briefMd }) => result(await updateProjectBrief(projectId, briefMd), () => ({ ok: true })),
  );

  server.registerTool(
    "log_decision",
    {
      title: "Log a decision",
      description: "Add a dated decision to a project's decision log, with who decided and where it came from.",
      inputSchema: {
        projectId: id,
        title: z.string().min(1).max(300).describe("The decision, as one sentence"),
        details: z.string().max(10_000).optional().describe("Why, alternatives considered (markdown)"),
        decidedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("yyyy-MM-dd; default today"),
        decidedBy: z.string().max(200).optional(),
        sourceNote: z.string().max(500).optional().describe("Where it was decided, e.g. 'call 3 Oct'"),
        sourceMessageId: id.optional().describe("Message the decision came from"),
      },
      annotations: write,
    },
    async (a) =>
      result(
        await saveDecision(
          null,
          fd({
            projectId: a.projectId,
            title: a.title,
            detailsMd: a.details,
            decidedOn: a.decidedOn,
            decidedBy: a.decidedBy,
            sourceNote: a.sourceNote,
            sourceMessageId: a.sourceMessageId,
          }),
        ),
        () => ({ ok: true }),
      ),
  );

  server.registerTool(
    "add_change_request",
    {
      title: "Propose a change request",
      description:
        "Record a requested change to a project's agreed scope (status 'proposed'). The user approves or rejects it in SoloOS.",
      inputSchema: {
        projectId: id,
        title: z.string().min(1).max(300),
        details: z.string().max(10_000).optional(),
        requestedBy: z.string().max(200).optional(),
        hoursImpact: z.string().optional().describe("Signed duration, e.g. '+6h', '-1:30'"),
        priceImpact: z.number().optional().describe("Signed amount in major units (e.g. 1500 = 1500 PLN)"),
        sourceMessageId: id.optional(),
      },
      annotations: write,
    },
    async (a) =>
      result(
        await saveChangeRequest(
          null,
          fd({
            projectId: a.projectId,
            title: a.title,
            detailsMd: a.details,
            requestedBy: a.requestedBy,
            hoursImpact: a.hoursImpact,
            priceImpact: a.priceImpact,
            sourceMessageId: a.sourceMessageId,
          }),
        ),
        () => ({ ok: true }),
      ),
  );

  server.registerTool(
    "save_doc_page",
    {
      title: "Create or update a doc page",
      description:
        "Write a project doc page in markdown. Diagrams go in ```mermaid code blocks. Pass pageId to update an existing page (a revision is kept).",
      inputSchema: {
        projectId: id,
        title: z.string().min(1).max(200),
        bodyMd: z.string().max(200_000),
        pageId: id.optional(),
        note: z.string().max(300).optional().describe("What changed (starts a new revision)"),
      },
      annotations: write,
    },
    async ({ projectId, title, bodyMd, pageId, note }) => {
      let target = pageId;
      if (target) {
        const existing = await db.query.docPages.findFirst({ where: eq(docPages.id, target) });
        if (!existing || existing.projectId !== projectId) return fail(`Doc page ${target} isn't in project ${projectId}`);
      } else {
        const created = await createDocPage(projectId, title);
        if (!created.ok) return fail(created.error);
        target = created.data!;
      }
      return result(await saveDocPage(target, { title, bodyMd, note: note ?? (pageId ? "Updated by Claude" : undefined) }), () => ({
        pageId: target,
      }));
    },
  );

  server.registerTool(
    "import_messages",
    {
      title: "Import chat messages",
      description:
        "Save chat messages (e.g. transcribed from a screenshot) as a thread under a client, optionally linked to a project or lead. Pass threadId to append to an existing thread.",
      inputSchema: {
        clientId: id,
        channel: z.enum(channel.enumValues),
        title: z.string().max(200).optional(),
        projectId: id.optional(),
        leadId: id.optional(),
        threadId: id.optional(),
        me: z.string().optional().describe("Which sender name is the user"),
        messages: z
          .array(
            z.object({
              sender: z.string().max(200),
              sentAt: z.string().describe("ISO date-time, or 'yyyy-MM-dd HH:mm' in the user's timezone"),
              body: z.string().min(1).max(20_000),
            }),
          )
          .min(1)
          .max(1000),
      },
      annotations: write,
    },
    async (a) => {
      const msgs = [];
      for (const m of a.messages) {
        const d = new Date(m.sentAt.includes("T") || /[zZ]|[+-]\d\d:?\d\d$/.test(m.sentAt) ? m.sentAt : m.sentAt.replace(" ", "T"));
        if (Number.isNaN(d.getTime())) return fail(`Can't read "${m.sentAt}" as a date-time`);
        msgs.push({ sender: m.sender, at: format(d, "yyyy-MM-dd'T'HH:mm"), body: m.body });
      }
      return result(
        await savePastedThread({
          threadId: a.threadId,
          orgId: a.clientId,
          projectId: a.projectId,
          opportunityId: a.leadId,
          channel: a.channel,
          title: a.title ?? "",
          me: a.me,
          messages: msgs,
        }),
        (threadId) => ({ threadId, saved: msgs.length }),
      );
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description: "Add a task to a project.",
      inputSchema: {
        projectId: id,
        title: z.string().min(1).max(300),
        status: z.enum(["backlog", "todo", "in_progress", "review", "done"]).optional(),
        priority: z.number().int().min(0).max(3).optional().describe("0 none, 1 low, 2 medium, 3 high"),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        estimate: z.string().optional().describe("e.g. '2h', '1:30'"),
      },
      annotations: write,
    },
    async (a) =>
      result(
        await createTask(
          fd({ projectId: a.projectId, title: a.title, status: a.status, priority: a.priority, dueDate: a.dueDate, estimate: a.estimate }),
        ),
        (taskId) => ({ taskId }),
      ),
  );

  return server;
}
