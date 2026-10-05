ALTER TYPE "public"."agent_action_type" ADD VALUE IF NOT EXISTS 'TRANSACTION_UPDATE';--> statement-breakpoint
ALTER TYPE "public"."agent_action_type" ADD VALUE IF NOT EXISTS 'TRANSACTION_CORRECT';
