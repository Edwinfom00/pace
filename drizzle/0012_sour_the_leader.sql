ALTER TABLE "workspace_invitation" ALTER COLUMN "invited_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pace_user_profile" ADD COLUMN "onboarding_skipped_steps" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "pace_user_profile" ADD COLUMN "onboarding_invitation_id" text;