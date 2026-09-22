-- M9.5: reuse financial_inbox_audit for retry-safe recurring review actions.
-- Existing audit rows remain valid because these command fields are nullable.
ALTER TABLE "financial_inbox_audit" ADD COLUMN "command_fingerprint" varchar(128);--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD COLUMN "idempotency_key" varchar(180);--> statement-breakpoint
CREATE UNIQUE INDEX "financial_inbox_audit_workspace_actor_key_unique" ON "financial_inbox_audit" USING btree ("workspace_id","actor_user_id","idempotency_key") WHERE "financial_inbox_audit"."actor_user_id" IS NOT NULL AND "financial_inbox_audit"."idempotency_key" IS NOT NULL;--> statement-breakpoint
