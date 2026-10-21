CREATE TYPE "public"."open_question_status" AS ENUM('open', 'in_progress', 'answered', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."rule_kind" AS ENUM('fact', 'constraint', 'action', 'inference', 'computation');--> statement-breakpoint
CREATE TABLE "business_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "business_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"kind" "rule_kind" DEFAULT 'constraint' NOT NULL,
	"details_md" text DEFAULT '' NOT NULL,
	"implemented_in" text,
	"source_decision_id" integer,
	"source_note" text,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_rules_projectId_code_unique" UNIQUE("project_id","code")
);
--> statement-breakpoint
CREATE TABLE "open_questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "open_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"code" text NOT NULL,
	"question" text NOT NULL,
	"details_md" text DEFAULT '' NOT NULL,
	"owner" text,
	"where_in_docs" text,
	"asked_on" date NOT NULL,
	"due_date" date,
	"status" "open_question_status" DEFAULT 'open' NOT NULL,
	"answer_md" text DEFAULT '' NOT NULL,
	"closed_on" date,
	"decision_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "open_questions_projectId_code_unique" UNIQUE("project_id","code")
);
--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_source_decision_id_decisions_id_fk" FOREIGN KEY ("source_decision_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "open_questions" ADD CONSTRAINT "open_questions_decision_id_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "open_questions_project_id_status_index" ON "open_questions" USING btree ("project_id","status");