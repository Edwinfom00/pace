CREATE TABLE "ledger_transaction_correction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"reversal_transaction_id" text NOT NULL,
	"replacement_transaction_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"command_fingerprint" varchar(128) NOT NULL,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD COLUMN "reversal_of_transaction_id" text;--> statement-breakpoint
ALTER TABLE "ledger_transaction_correction" ADD CONSTRAINT "ledger_transaction_correction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_correction" ADD CONSTRAINT "ledger_transaction_correction_original_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("original_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_correction" ADD CONSTRAINT "ledger_transaction_correction_reversal_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("reversal_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_correction" ADD CONSTRAINT "ledger_transaction_correction_replacement_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("replacement_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction_correction" ADD CONSTRAINT "ledger_transaction_correction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transaction_correction_original_unique" ON "ledger_transaction_correction" USING btree ("original_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transaction_correction_reversal_unique" ON "ledger_transaction_correction" USING btree ("reversal_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transaction_correction_replacement_unique" ON "ledger_transaction_correction" USING btree ("replacement_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transaction_correction_workspace_actor_key_unique" ON "ledger_transaction_correction" USING btree ("workspace_id","actor_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_transaction_correction_workspace_created_idx" ON "ledger_transaction_correction" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_reversal_of_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("reversal_of_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_transaction_reversal_of_transaction_idx" ON "ledger_transaction" USING btree ("reversal_of_transaction_id");