CREATE TYPE "public"."ledger_account_audit_action" AS ENUM('RENAMED', 'TYPE_CHANGED', 'ARCHIVED', 'RESTORED');--> statement-breakpoint
CREATE TABLE "ledger_account_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "account_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "action" "ledger_account_audit_action" NOT NULL,
  "command_fingerprint" varchar(128) NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ledger_account_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ledger_account_audit_account_id_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "ledger_account_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX "ledger_account_audit_workspace_created_idx" ON "ledger_account_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_account_audit_account_created_idx" ON "ledger_account_audit" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_account_audit_workspace_actor_key_unique" ON "ledger_account_audit" USING btree ("workspace_id","actor_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_transaction_workspace_account_idx" ON "ledger_transaction" USING btree ("workspace_id","account_id");--> statement-breakpoint
CREATE INDEX "ledger_transaction_workspace_transfer_account_idx" ON "ledger_transaction" USING btree ("workspace_id","transfer_account_id");
