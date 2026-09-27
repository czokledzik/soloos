CREATE TYPE "public"."channel" AS ENUM('facebook', 'email', 'telegram', 'whatsapp', 'call', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('umowa_zlecenie', 'umowa_o_dzielo', 'b2b', 'useme', 'bizky', 'internal');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('in', 'out', 'both', 'internal');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('fb_group', 'referral', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('new', 'contacted', 'call', 'proposal', 'negotiating', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('company', 'person');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('lead', 'active', 'past', 'internal');--> statement-breakpoint
CREATE TYPE "public"."pricing" AS ENUM('hourly', 'fixed', 'none');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planned', 'active', 'paused', 'done', 'archived');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'todo', 'in_progress', 'review', 'done');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"emails" text[] DEFAULT '{}'::text[] NOT NULL,
	"phone" text,
	"telegram" text,
	"facebook_url" text,
	"linkedin_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "interactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"contact_id" integer,
	"opportunity_id" integer,
	"project_id" integer,
	"channel" "channel" DEFAULT 'other' NOT NULL,
	"direction" "direction" DEFAULT 'both' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text,
	"body_md" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opportunities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"contact_id" integer,
	"title" text NOT NULL,
	"stage" "opportunity_stage" DEFAULT 'new' NOT NULL,
	"source" "lead_source" DEFAULT 'other' NOT NULL,
	"source_detail" text,
	"source_url" text,
	"original_post_md" text DEFAULT '' NOT NULL,
	"est_value" integer,
	"next_action" text,
	"next_action_at" date,
	"lost_reason" text,
	"project_id" integer,
	"offer_slug" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"kind" "org_kind" DEFAULT 'company' NOT NULL,
	"status" "org_status" DEFAULT 'lead' NOT NULL,
	"website" text,
	"default_rate" integer,
	"currency" text DEFAULT 'PLN' NOT NULL,
	"notes_md" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"label" text NOT NULL,
	"percent" smallint,
	"amount" integer NOT NULL,
	"due_date" date,
	"paid_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"contract_type" "contract_type",
	"pricing" "pricing" DEFAULT 'hourly' NOT NULL,
	"hourly_rate" integer,
	"fixed_price" integer,
	"budget_hours" integer,
	"currency" text DEFAULT 'PLN' NOT NULL,
	"start_date" date,
	"due_date" date,
	"notes_md" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "running_timer" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"priority" smallint DEFAULT 0 NOT NULL,
	"due_date" date,
	"estimate_min" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"task_id" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"billable" boolean DEFAULT true NOT NULL,
	"rate_snapshot" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timer" ADD CONSTRAINT "running_timer_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "running_timer" ADD CONSTRAINT "running_timer_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_org_id_index" ON "contacts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "interactions_org_id_occurred_at_index" ON "interactions" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "opportunities_org_id_index" ON "opportunities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "opportunities_stage_index" ON "opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "payments_project_id_index" ON "payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_org_id_index" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "tasks_project_id_status_index" ON "tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "time_entries_started_at_index" ON "time_entries" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "time_entries_project_id_started_at_index" ON "time_entries" USING btree ("project_id","started_at");