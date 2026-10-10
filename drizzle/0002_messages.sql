CREATE TYPE "public"."thread_source" AS ENUM('paste', 'telegram', 'email');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"thread_id" integer NOT NULL,
	"participant_id" integer,
	"sent_at" timestamp with time zone NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "thread_participants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "thread_participants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"thread_id" integer NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"contact_id" integer,
	"is_me" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thread_participants_threadId_name_handle_unique" UNIQUE NULLS NOT DISTINCT("thread_id","name","handle")
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "threads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"opportunity_id" integer,
	"project_id" integer,
	"channel" "channel" DEFAULT 'other' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"source" "thread_source" DEFAULT 'paste' NOT NULL,
	"source_key" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "threads_sourceKey_unique" UNIQUE("source_key")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_participant_id_thread_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."thread_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participants" ADD CONSTRAINT "thread_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_thread_id_sent_at_index" ON "messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX "thread_participants_contact_id_index" ON "thread_participants" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "threads_org_id_last_message_at_index" ON "threads" USING btree ("org_id","last_message_at");--> statement-breakpoint
CREATE INDEX "threads_opportunity_id_index" ON "threads" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "threads_project_id_index" ON "threads" USING btree ("project_id");