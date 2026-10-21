import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Money is stored as integer minor units (grosze/cents).

const id = () => integer().primaryKey().generatedAlwaysAsIdentity();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const orgKind = pgEnum("org_kind", ["company", "person"]);
export const orgStatus = pgEnum("org_status", ["lead", "active", "past", "internal"]);
export const opportunityStage = pgEnum("opportunity_stage", [
  "new",
  "contacted",
  "call",
  "proposal",
  "negotiating",
  "won",
  "lost",
]);
export const leadSource = pgEnum("lead_source", ["fb_group", "referral", "email", "other"]);
export const channel = pgEnum("channel", [
  "facebook",
  "email",
  "telegram",
  "whatsapp",
  "call",
  "meeting",
  "other",
]);
export const direction = pgEnum("direction", ["in", "out", "both", "internal"]);
export const projectStatus = pgEnum("project_status", [
  "planned",
  "active",
  "paused",
  "done",
  "archived",
]);
export const contractType = pgEnum("contract_type", [
  "umowa_zlecenie",
  "umowa_o_dzielo",
  "b2b",
  "useme",
  "bizky",
  "internal",
]);
export const pricing = pgEnum("pricing", ["hourly", "fixed", "none"]);
export const taskStatus = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
]);

export const organizations = pgTable("organizations", {
  id: id(),
  name: text().notNull(),
  kind: orgKind().notNull().default("company"),
  status: orgStatus().notNull().default("lead"),
  website: text(),
  defaultRate: integer(),
  currency: text().notNull().default("PLN"),
  notesMd: text().notNull().default(""),
  archivedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    role: text(),
    emails: text().array().notNull().default(sql`'{}'::text[]`),
    phone: text(),
    telegram: text(),
    facebookUrl: text(),
    linkedinUrl: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    status: projectStatus().notNull().default("active"),
    contractType: contractType(),
    pricing: pricing().notNull().default("hourly"),
    hourlyRate: integer(),
    fixedPrice: integer(),
    budgetHours: integer(),
    currency: text().notNull().default("PLN"),
    startDate: date(),
    dueDate: date(),
    notesMd: text().notNull().default(""),
    // Short "what is this project" summary: the first thing anyone (or an AI) reads.
    briefMd: text().notNull().default(""),
    // Agreed scope for fixed-price work; change requests are measured against it.
    scopeMd: text().notNull().default(""),
    scopeBaselinedAt: timestamp({ withTimezone: true }),
    // Secret for the read-only client portal at /p/<token>; null = portal off.
    portalToken: text().unique(),
    // Optional portal sections, off until switched on per project.
    portalProgress: boolean().notNull().default(false),
    portalHours: boolean().notNull().default(false), // hours, value and payments
    portalDecisions: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: integer().references(() => contacts.id, { onDelete: "set null" }),
    title: text().notNull(),
    stage: opportunityStage().notNull().default("new"),
    source: leadSource().notNull().default("other"),
    sourceDetail: text(),
    sourceUrl: text(),
    originalPostMd: text().notNull().default(""),
    estValue: integer(),
    nextAction: text(),
    nextActionAt: date(),
    lostReason: text(),
    projectId: integer().references(() => projects.id, { onDelete: "set null" }),
    offerSlug: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId), index().on(t.stage)],
);

export const interactions = pgTable(
  "interactions",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: integer().references(() => contacts.id, { onDelete: "set null" }),
    opportunityId: integer().references(() => opportunities.id, { onDelete: "set null" }),
    projectId: integer().references(() => projects.id, { onDelete: "set null" }),
    channel: channel().notNull().default("other"),
    direction: direction().notNull().default("both"),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    title: text(),
    bodyMd: text().notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId, t.occurredAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    label: text().notNull(),
    percent: smallint(),
    amount: integer().notNull(),
    dueDate: date(),
    paidAt: date(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    bodyMd: text().notNull().default(""),
    status: taskStatus().notNull().default("todo"),
    priority: smallint().notNull().default(0), // 0 none, 1 low, 2 medium, 3 high
    dueDate: date(),
    estimateMin: integer(),
    sortOrder: integer().notNull().default(0),
    completedAt: timestamp({ withTimezone: true }),
    importKey: text().unique(), // e.g. "linear:ABC-123", prevents duplicate imports
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId, t.status)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: integer().references(() => tasks.id, { onDelete: "set null" }),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    durationMin: integer().notNull(),
    note: text().notNull().default(""),
    billable: boolean().notNull().default(true),
    rateSnapshot: integer(), // hourly rate in minor units at the time of logging
    importKey: text().unique(), // e.g. "clockify:<hash>", prevents duplicate imports
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.startedAt), index().on(t.projectId, t.startedAt)],
);

// Singleton row (id = 1) for the one running timer.
export const runningTimer = pgTable("running_timer", {
  id: integer().primaryKey().default(1),
  projectId: integer()
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  taskId: integer().references(() => tasks.id, { onDelete: "set null" }),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  note: text().notNull().default(""),
});

// ---------- Messages ----------
// A thread is one conversation on one channel (an email thread, a Telegram chat,
// a group chat). Participants are the people in it as they appear in the source
// (name + handle), each optionally mapped to a contact; one of them can be "me".

export const threadSource = pgEnum("thread_source", ["paste", "telegram", "email"]);

export const threads = pgTable(
  "threads",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    opportunityId: integer().references(() => opportunities.id, { onDelete: "set null" }),
    projectId: integer().references(() => projects.id, { onDelete: "set null" }),
    channel: channel().notNull().default("other"),
    title: text().notNull().default(""),
    source: threadSource().notNull().default("paste"),
    sourceKey: text().unique(), // e.g. "telegram:123456", "email:<root message-id>"
    lastMessageAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId, t.lastMessageAt), index().on(t.opportunityId), index().on(t.projectId)],
);

export const threadParticipants = pgTable(
  "thread_participants",
  {
    id: id(),
    threadId: integer()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    name: text().notNull(),
    handle: text(), // email address, Telegram user id/username; null for pasted text
    contactId: integer().references(() => contacts.id, { onDelete: "set null" }),
    isMe: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.threadId, t.name, t.handle).nullsNotDistinct(), index().on(t.contactId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    threadId: integer()
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    participantId: integer().references(() => threadParticipants.id, { onDelete: "set null" }),
    sentAt: timestamp({ withTimezone: true }).notNull(),
    bodyMd: text().notNull().default(""),
    sourceKey: text().unique(), // e.g. "telegram:123456:789", "email:<message-id>"
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.threadId, t.sentAt)],
);

// ---------- Project docs ----------

export const changeRequestStatus = pgEnum("change_request_status", ["proposed", "approved", "rejected"]);
export const systemKind = pgEnum("system_kind", [
  "repo",
  "n8n",
  "elevenlabs",
  "twilio",
  "baserow",
  "vercel",
  "database",
  "doc",
  "other",
]);

/** Dated decisions with where they came from and who made them. */
export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    decidedOn: date().notNull(),
    title: text().notNull(),
    detailsMd: text().notNull().default(""),
    decidedBy: text(), // free text: "Anna (client)", "me", "both"
    sourceMessageId: integer().references(() => messages.id, { onDelete: "set null" }),
    sourceInteractionId: integer().references(() => interactions.id, { onDelete: "set null" }),
    sourceNote: text(), // "call 3 Oct", link, …
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId, t.decidedOn)],
);

/** Requested changes to the agreed scope, with their effect on hours and price. */
export const changeRequests = pgTable(
  "change_requests",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    detailsMd: text().notNull().default(""),
    requestedBy: text(),
    requestedOn: date().notNull(),
    hoursImpactMin: integer(), // + more work, - less
    priceImpact: integer(), // minor units, in the project's currency
    status: changeRequestStatus().notNull().default("proposed"),
    decidedOn: date(),
    sourceMessageId: integer().references(() => messages.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId)],
);

/** Free-form project documents (markdown, may contain Mermaid diagrams). */
export const docPages = pgTable(
  "doc_pages",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    bodyMd: text().notNull().default(""),
    sortOrder: integer().notNull().default(0),
    /** Shown on the client portal (always the latest version). */
    published: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId)],
);

/** Progress updates for the client; drafts until published. */
export const projectUpdates = pgTable(
  "project_updates",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    bodyMd: text().notNull().default(""),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId, t.publishedAt)],
);

/** Every saved version of a doc page (the latest is also on doc_pages). */
export const docRevisions = pgTable(
  "doc_revisions",
  {
    id: id(),
    pageId: integer()
      .notNull()
      .references(() => docPages.id, { onDelete: "cascade" }),
    title: text().notNull(),
    bodyMd: text().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.pageId, t.createdAt)],
);

/** Links to the systems a project runs on. Never credentials. */
export const systems = pgTable(
  "systems",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: systemKind().notNull().default("other"),
    name: text().notNull(),
    url: text(),
    notes: text().notNull().default(""),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.projectId)],
);

// Wiegers' business rule types: what is true, what is forbidden, what is allowed to happen,
// what follows from what, and what is calculated.
export const ruleKind = pgEnum("rule_kind", ["fact", "constraint", "action", "inference", "computation"]);

/** Rules currently in force ("the bot never quotes prices"), with the decision they came from. */
export const businessRules = pgTable(
  "business_rules",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text().notNull(), // "BR-01", stable so docs and prompts can cite it
    title: text().notNull(),
    kind: ruleKind().notNull().default("constraint"),
    detailsMd: text().notNull().default(""),
    implementedIn: text(), // free text: "main prompt, invoices-general"
    sourceDecisionId: integer().references(() => decisions.id, { onDelete: "set null" }),
    sourceNote: text(),
    retiredAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.projectId, t.code)],
);

export const openQuestionStatus = pgEnum("open_question_status", ["open", "in_progress", "answered", "dropped"]);

/** Things nobody has decided yet (Wiegers' TBD list). Answering one can log a decision. */
export const openQuestions = pgTable(
  "open_questions",
  {
    id: id(),
    projectId: integer()
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text().notNull(), // "Q-01"
    question: text().notNull(),
    detailsMd: text().notNull().default(""),
    owner: text(), // who has to answer: "Anna (client)", "me"
    whereInDocs: text(), // "2. Call flow, diagram 5"
    askedOn: date().notNull(),
    dueDate: date(),
    status: openQuestionStatus().notNull().default("open"),
    answerMd: text().notNull().default(""),
    closedOn: date(),
    decisionId: integer().references(() => decisions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.projectId, t.code), index().on(t.projectId, t.status)],
);

// ---------- AI ----------

// Files attached to a client, optionally to one of its projects (proposals, contracts, specs).
// The bytes live in `attachment_data` so listing files never loads them.
export const attachments = pgTable(
  "attachments",
  {
    id: id(),
    orgId: integer()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: integer().references(() => projects.id, { onDelete: "cascade" }),
    name: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    note: text().notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId), index().on(t.projectId)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const attachmentData = pgTable("attachment_data", {
  attachmentId: integer()
    .primaryKey()
    .references(() => attachments.id, { onDelete: "cascade" }),
  data: bytea().notNull(),
});

export const aiJobKind = pgEnum("ai_job_kind", ["thread_insights", "project_brief", "lead_reply"]);
export const aiJobStatus = pgEnum("ai_job_status", ["queued", "running", "done", "failed"]);

/**
 * One AI request (a button press). Run right away through the API, or queued for
 * a local Claude Code runner that polls for work. Results are suggestions the
 * user accepts or ignores; nothing is applied automatically.
 */
export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: id(),
    kind: aiJobKind().notNull(),
    // What it's about, e.g. { threadId: 3 }; also used to find the latest job for a page.
    subject: text().notNull(),
    status: aiJobStatus().notNull().default("queued"),
    provider: text().notNull(), // "api" | "runner"
    prompt: text().notNull(),
    result: jsonb(),
    error: text(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.subject, t.createdAt), index().on(t.status, t.createdAt)],
);

/** Small bits of app state, e.g. how far the email sync got per mailbox. */
export const appState = pgTable("app_state", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  projects: many(projects),
  opportunities: many(opportunities),
  interactions: many(interactions),
  attachments: many(attachments),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  org: one(organizations, { fields: [contacts.orgId], references: [organizations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  tasks: many(tasks),
  payments: many(payments),
  timeEntries: many(timeEntries),
  decisions: many(decisions),
  changeRequests: many(changeRequests),
  docPages: many(docPages),
  systems: many(systems),
  businessRules: many(businessRules),
  openQuestions: many(openQuestions),
  updates: many(projectUpdates),
  attachments: many(attachments),
}));

export const projectUpdatesRelations = relations(projectUpdates, ({ one }) => ({
  project: one(projects, { fields: [projectUpdates.projectId], references: [projects.id] }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  project: one(projects, { fields: [decisions.projectId], references: [projects.id] }),
  sourceMessage: one(messages, { fields: [decisions.sourceMessageId], references: [messages.id] }),
  sourceInteraction: one(interactions, { fields: [decisions.sourceInteractionId], references: [interactions.id] }),
}));

export const changeRequestsRelations = relations(changeRequests, ({ one }) => ({
  project: one(projects, { fields: [changeRequests.projectId], references: [projects.id] }),
  sourceMessage: one(messages, { fields: [changeRequests.sourceMessageId], references: [messages.id] }),
}));

export const docPagesRelations = relations(docPages, ({ one, many }) => ({
  project: one(projects, { fields: [docPages.projectId], references: [projects.id] }),
  revisions: many(docRevisions),
}));

export const docRevisionsRelations = relations(docRevisions, ({ one }) => ({
  page: one(docPages, { fields: [docRevisions.pageId], references: [docPages.id] }),
}));

export const systemsRelations = relations(systems, ({ one }) => ({
  project: one(projects, { fields: [systems.projectId], references: [projects.id] }),
}));

export const businessRulesRelations = relations(businessRules, ({ one }) => ({
  project: one(projects, { fields: [businessRules.projectId], references: [projects.id] }),
  sourceDecision: one(decisions, { fields: [businessRules.sourceDecisionId], references: [decisions.id] }),
}));

export const openQuestionsRelations = relations(openQuestions, ({ one }) => ({
  project: one(projects, { fields: [openQuestions.projectId], references: [projects.id] }),
  decision: one(decisions, { fields: [openQuestions.decisionId], references: [decisions.id] }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  org: one(organizations, { fields: [opportunities.orgId], references: [organizations.id] }),
  contact: one(contacts, { fields: [opportunities.contactId], references: [contacts.id] }),
  project: one(projects, { fields: [opportunities.projectId], references: [projects.id] }),
}));

export const interactionsRelations = relations(interactions, ({ one }) => ({
  org: one(organizations, { fields: [interactions.orgId], references: [organizations.id] }),
  contact: one(contacts, { fields: [interactions.contactId], references: [contacts.id] }),
  opportunity: one(opportunities, {
    fields: [interactions.opportunityId],
    references: [opportunities.id],
  }),
  project: one(projects, { fields: [interactions.projectId], references: [projects.id] }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  timeEntries: many(timeEntries),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));

export const runningTimerRelations = relations(runningTimer, ({ one }) => ({
  project: one(projects, { fields: [runningTimer.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [runningTimer.taskId], references: [tasks.id] }),
}));

export const threadsRelations = relations(threads, ({ one, many }) => ({
  org: one(organizations, { fields: [threads.orgId], references: [organizations.id] }),
  opportunity: one(opportunities, { fields: [threads.opportunityId], references: [opportunities.id] }),
  project: one(projects, { fields: [threads.projectId], references: [projects.id] }),
  participants: many(threadParticipants),
  messages: many(messages),
}));

export const threadParticipantsRelations = relations(threadParticipants, ({ one, many }) => ({
  thread: one(threads, { fields: [threadParticipants.threadId], references: [threads.id] }),
  contact: one(contacts, { fields: [threadParticipants.contactId], references: [contacts.id] }),
  messages: many(messages),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  org: one(organizations, { fields: [attachments.orgId], references: [organizations.id] }),
  project: one(projects, { fields: [attachments.projectId], references: [projects.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(threads, { fields: [messages.threadId], references: [threads.id] }),
  participant: one(threadParticipants, { fields: [messages.participantId], references: [threadParticipants.id] }),
}));

export type Organization = typeof organizations.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type ThreadParticipant = typeof threadParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
export type ChangeRequest = typeof changeRequests.$inferSelect;
export type DocPage = typeof docPages.$inferSelect;
export type BusinessRule = typeof businessRules.$inferSelect;
export type OpenQuestion = typeof openQuestions.$inferSelect;
export type DocRevision = typeof docRevisions.$inferSelect;
export type ProjectSystem = typeof systems.$inferSelect;
export type ProjectUpdate = typeof projectUpdates.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type OpportunityStage = (typeof opportunityStage.enumValues)[number];
