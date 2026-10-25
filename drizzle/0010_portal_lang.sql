CREATE TYPE "public"."portal_lang" AS ENUM('en', 'pl');--> statement-breakpoint
-- Portals that already exist were written in Polish; new projects default to English.
ALTER TABLE "projects" ADD COLUMN "portal_lang" "portal_lang" DEFAULT 'pl' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "portal_lang" SET DEFAULT 'en';
