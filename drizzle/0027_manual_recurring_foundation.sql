CREATE TYPE "public"."recurring_payment_origin" AS ENUM('DETECTED', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."recurring_payment_direction" AS ENUM('EXPENSE', 'INCOME');--> statement-breakpoint
ALTER TABLE "recurring_payment" ALTER COLUMN "normalized_merchant" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "display_name" varchar(160);--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "origin" "recurring_payment_origin" DEFAULT 'DETECTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "direction" "recurring_payment_direction" DEFAULT 'EXPENSE' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "next_occurrence_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD COLUMN "command_fingerprint" varchar(128);--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_payment_workspace_actor_key_unique" ON "recurring_payment" USING btree ("workspace_id", "created_by_user_id", "idempotency_key") WHERE "recurring_payment"."created_by_user_id" IS NOT NULL AND "recurring_payment"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "recurring_payment_workspace_origin_idx" ON "recurring_payment" USING btree ("workspace_id", "origin");
