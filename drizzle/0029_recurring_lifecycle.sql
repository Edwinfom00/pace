-- M9.6: lifecycle controls future recurrence planning independently of the
-- retained detected-review state. Existing patterns remain active by default.
CREATE TYPE "public"."recurring_payment_lifecycle" AS ENUM('ACTIVE', 'PAUSED');--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "lifecycle" "recurring_payment_lifecycle" DEFAULT 'ACTIVE' NOT NULL;
