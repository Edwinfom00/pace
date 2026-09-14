CREATE TYPE "public"."financial_inbox_reason" AS ENUM('UNKNOWN_CATEGORY', 'POSSIBLE_TRANSFER', 'POSSIBLE_RECURRING', 'MERCHANT_AMBIGUITY', 'CLASSIFICATION_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."financial_inbox_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."recurring_payment_status" AS ENUM('CANDIDATE', 'CONFIRMED', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."transaction_classification_source" AS ENUM('USER_RULE', 'DETERMINISTIC', 'AI_SUGGESTION', 'EXISTING_LEDGER', 'USER_CORRECTION', 'UNCLASSIFIED');--> statement-breakpoint
CREATE TYPE "public"."transaction_classification_status" AS ENUM('APPLIED', 'NEEDS_REVIEW', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "financial_inbox_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"inbox_item_id" text,
	"classification_id" text,
	"recurring_payment_id" text,
	"actor_user_id" text,
	"event" varchar(100) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_inbox_item" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"classification_id" text,
	"recurring_payment_id" text,
	"reason" "financial_inbox_reason" NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "financial_inbox_status" DEFAULT 'OPEN' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"detection_key" varchar(256) NOT NULL,
	"normalized_merchant" varchar(160) NOT NULL,
	"account_id" text,
	"category_id" text,
	"currency" varchar(3) NOT NULL,
	"typical_amount_minor" bigint NOT NULL,
	"amount_tolerance_bps" integer NOT NULL,
	"cadence_days" integer NOT NULL,
	"first_occurred_at" timestamp with time zone NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"sample_transaction_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "recurring_payment_status" DEFAULT 'CANDIDATE' NOT NULL,
	"confirmed_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	"ignored_by_user_id" text,
	"ignored_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_payment_amount_tolerance_check" CHECK ("recurring_payment"."amount_tolerance_bps" >= 0 AND "recurring_payment"."amount_tolerance_bps" <= 10000),
	CONSTRAINT "recurring_payment_cadence_check" CHECK ("recurring_payment"."cadence_days" >= 7 AND "recurring_payment"."cadence_days" <= 400)
);
--> statement-breakpoint
CREATE TABLE "transaction_classification_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"normalized_merchant" varchar(160) NOT NULL,
	"category_id" text NOT NULL,
	"kind" "ledger_category_kind" NOT NULL,
	"created_by_user_id" text NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_classification_rule_kind_check" CHECK ("transaction_classification_rule"."kind" IN ('EXPENSE', 'INCOME'))
);
--> statement-breakpoint
CREATE TABLE "transaction_classification" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"merchant_name" varchar(160),
	"normalized_merchant" varchar(160),
	"suggested_category_id" text,
	"applied_category_id" text,
	"source" "transaction_classification_source" NOT NULL,
	"confidence" real NOT NULL,
	"status" "transaction_classification_status" NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_classification_confidence_check" CHECK ("transaction_classification"."confidence" >= 0 AND "transaction_classification"."confidence" <= 1)
);
--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD CONSTRAINT "financial_inbox_audit_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD CONSTRAINT "financial_inbox_audit_inbox_item_id_financial_inbox_item_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."financial_inbox_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD CONSTRAINT "financial_inbox_audit_classification_id_transaction_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."transaction_classification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD CONSTRAINT "financial_inbox_audit_recurring_payment_id_recurring_payment_id_fk" FOREIGN KEY ("recurring_payment_id") REFERENCES "public"."recurring_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_audit" ADD CONSTRAINT "financial_inbox_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_item" ADD CONSTRAINT "financial_inbox_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_item" ADD CONSTRAINT "financial_inbox_item_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_item" ADD CONSTRAINT "financial_inbox_item_classification_id_transaction_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."transaction_classification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_item" ADD CONSTRAINT "financial_inbox_item_recurring_payment_id_recurring_payment_id_fk" FOREIGN KEY ("recurring_payment_id") REFERENCES "public"."recurring_payment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_inbox_item" ADD CONSTRAINT "financial_inbox_item_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_account_id_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_category_id_ledger_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_payment" ADD CONSTRAINT "recurring_payment_ignored_by_user_id_user_id_fk" FOREIGN KEY ("ignored_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification_rule" ADD CONSTRAINT "transaction_classification_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification_rule" ADD CONSTRAINT "transaction_classification_rule_category_id_ledger_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification_rule" ADD CONSTRAINT "transaction_classification_rule_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification_rule" ADD CONSTRAINT "transaction_classification_rule_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification" ADD CONSTRAINT "transaction_classification_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification" ADD CONSTRAINT "transaction_classification_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification" ADD CONSTRAINT "transaction_classification_suggested_category_id_ledger_category_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification" ADD CONSTRAINT "transaction_classification_applied_category_id_ledger_category_id_fk" FOREIGN KEY ("applied_category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classification" ADD CONSTRAINT "transaction_classification_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_inbox_audit_workspace_created_idx" ON "financial_inbox_audit" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_inbox_audit_inbox_created_idx" ON "financial_inbox_audit" USING btree ("inbox_item_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_inbox_audit_classification_created_idx" ON "financial_inbox_audit" USING btree ("classification_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_inbox_item_workspace_status_idx" ON "financial_inbox_item" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "financial_inbox_item_transaction_idx" ON "financial_inbox_item" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_payment_workspace_detection_key_unique" ON "recurring_payment" USING btree ("workspace_id","detection_key");--> statement-breakpoint
CREATE INDEX "recurring_payment_workspace_status_idx" ON "recurring_payment" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_classification_rule_workspace_merchant_kind_unique" ON "transaction_classification_rule" USING btree ("workspace_id","normalized_merchant","kind");--> statement-breakpoint
CREATE INDEX "transaction_classification_rule_workspace_idx" ON "transaction_classification_rule" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_classification_transaction_unique" ON "transaction_classification" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_classification_workspace_status_idx" ON "transaction_classification" USING btree ("workspace_id","status");