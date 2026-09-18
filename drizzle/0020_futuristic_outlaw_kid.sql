CREATE TABLE "ledger_transaction_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" varchar(32) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_transaction_audit" ADD CONSTRAINT "ledger_transaction_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_audit" ADD CONSTRAINT "ledger_transaction_audit_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_audit" ADD CONSTRAINT "ledger_transaction_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_transaction_audit_workspace_created_idx" ON "ledger_transaction_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_transaction_audit_transaction_created_idx" ON "ledger_transaction_audit" USING btree ("transaction_id","created_at");