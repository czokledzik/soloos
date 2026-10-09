CREATE TYPE "public"."ai_job_kind" AS ENUM('thread_insights', 'project_brief', 'lead_reply');--> statement-breakpoint
CREATE TYPE "public"."ai_job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"kind" "ai_job_kind" NOT NULL,
	"subject" text NOT NULL,
	"status" "ai_job_status" DEFAULT 'queued' NOT NULL,
	"provider" text NOT NULL,
	"prompt" text NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_jobs_subject_created_at_index" ON "ai_jobs" USING btree ("subject","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_created_at_index" ON "ai_jobs" USING btree ("status","created_at");