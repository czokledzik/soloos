ALTER TABLE "tasks" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "import_key" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_importKey_unique" UNIQUE("import_key");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_importKey_unique" UNIQUE("import_key");