ALTER TABLE "ledger_category" ADD COLUMN "parent_category_id" text;
--> statement-breakpoint
ALTER TABLE "ledger_category" ADD CONSTRAINT "ledger_category_parent_category_id_ledger_category_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ledger_category_parent_idx" ON "ledger_category" USING btree ("workspace_id", "parent_category_id");
