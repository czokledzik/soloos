import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
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

export const organizationsRelations = relations(organizations, ({ many }) => ({
  contacts: many(contacts),
  projects: many(projects),
  opportunities: many(opportunities),
  interactions: many(interactions),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  org: one(organizations, { fields: [contacts.orgId], references: [organizations.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  org: one(organizations, { fields: [projects.orgId], references: [organizations.id] }),
  tasks: many(tasks),
  payments: many(payments),
  timeEntries: many(timeEntries),
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

export type Organization = typeof organizations.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type TaskStatus = (typeof taskStatus.enumValues)[number];
export type OpportunityStage = (typeof opportunityStage.enumValues)[number];
