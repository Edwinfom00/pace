CREATE TYPE "public"."pace_proactivity" AS ENUM('QUIET', 'BALANCED', 'PROACTIVE');--> statement-breakpoint
ALTER TABLE "member_notification_preference" ADD COLUMN "pace_goals" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "member_notification_preference" ADD COLUMN "proactivity" "pace_proactivity" DEFAULT 'BALANCED' NOT NULL;