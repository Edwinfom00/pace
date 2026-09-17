CREATE TYPE "public"."ledger_account_type" AS ENUM('CASH', 'CHECKING', 'SAVINGS', 'CREDIT_CARD', 'MOBILE_MONEY', 'OTHER');--> statement-breakpoint
-- Existing accounts predate canonical account types. OTHER is the only safe
-- non-interpretive backfill; new manual account creation always requires type.
ALTER TABLE "ledger_account" ADD COLUMN "type" "ledger_account_type" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_account" ALTER COLUMN "type" DROP DEFAULT;
