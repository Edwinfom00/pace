CREATE TYPE "public"."ledger_category_kind" AS ENUM('EXPENSE', 'INCOME');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_kind" AS ENUM('EXPENSE', 'INCOME', 'TRANSFER', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."ledger_transaction_status" AS ENUM('PENDING', 'POSTED');--> statement-breakpoint
CREATE TABLE "ledger_account" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_currency_check" CHECK ("ledger_account"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "ledger_category" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" varchar(120) NOT NULL,
	"kind" "ledger_category_kind" NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"system_key" varchar(120),
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_category_scope_check" CHECK ((
        "ledger_category"."is_system" = true
        AND "ledger_category"."workspace_id" IS NULL
        AND "ledger_category"."created_by_user_id" IS NULL
        AND "ledger_category"."system_key" IS NOT NULL
      ) OR (
        "ledger_category"."is_system" = false
        AND "ledger_category"."workspace_id" IS NOT NULL
        AND "ledger_category"."created_by_user_id" IS NOT NULL
        AND "ledger_category"."system_key" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "ledger_merchant" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" varchar(160) NOT NULL,
	"normalized_name" varchar(160) NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" "ledger_transaction_kind" NOT NULL,
	"status" "ledger_transaction_status" DEFAULT 'POSTED' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"account_id" text,
	"transfer_account_id" text,
	"category_id" text,
	"merchant_id" text,
	"created_by_user_id" text NOT NULL,
	"paid_by_user_id" text,
	"transfer_group_id" text,
	"refunded_transaction_id" text,
	"source" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deduplication_fingerprint" varchar(128),
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transaction_amount_positive_check" CHECK ("ledger_transaction"."amount_minor" > 0),
	CONSTRAINT "ledger_transaction_currency_check" CHECK ("ledger_transaction"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_transaction_shape_check" CHECK ((
        "ledger_transaction"."kind" = 'TRANSFER'
        AND "ledger_transaction"."account_id" IS NOT NULL
        AND "ledger_transaction"."transfer_account_id" IS NOT NULL
        AND "ledger_transaction"."account_id" <> "ledger_transaction"."transfer_account_id"
        AND "ledger_transaction"."category_id" IS NULL
        AND "ledger_transaction"."merchant_id" IS NULL
        AND "ledger_transaction"."refunded_transaction_id" IS NULL
        AND "ledger_transaction"."transfer_group_id" IS NOT NULL
      ) OR (
        "ledger_transaction"."kind" IN ('EXPENSE', 'INCOME')
        AND "ledger_transaction"."account_id" IS NOT NULL
        AND "ledger_transaction"."transfer_account_id" IS NULL
        AND "ledger_transaction"."category_id" IS NOT NULL
        AND "ledger_transaction"."refunded_transaction_id" IS NULL
        AND "ledger_transaction"."transfer_group_id" IS NULL
      ) OR (
        "ledger_transaction"."kind" = 'REFUND'
        AND "ledger_transaction"."account_id" IS NOT NULL
        AND "ledger_transaction"."transfer_account_id" IS NULL
        AND "ledger_transaction"."category_id" IS NOT NULL
        AND "ledger_transaction"."refunded_transaction_id" IS NOT NULL
        AND "ledger_transaction"."transfer_group_id" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_category" ADD CONSTRAINT "ledger_category_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_category" ADD CONSTRAINT "ledger_category_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_merchant" ADD CONSTRAINT "ledger_merchant_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_merchant" ADD CONSTRAINT "ledger_merchant_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_account_id_ledger_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_transfer_account_id_ledger_account_id_fk" FOREIGN KEY ("transfer_account_id") REFERENCES "public"."ledger_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_category_id_ledger_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ledger_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_merchant_id_ledger_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."ledger_merchant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_paid_by_user_id_user_id_fk" FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_refunded_transaction_id_ledger_transaction_id_fk" FOREIGN KEY ("refunded_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_account_workspace_idx" ON "ledger_account" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "ledger_category_workspace_idx" ON "ledger_category" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_category_system_key_unique" ON "ledger_category" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_category_workspace_name_unique" ON "ledger_category" USING btree ("workspace_id","kind","name") WHERE "ledger_category"."workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_merchant_workspace_normalized_name_unique" ON "ledger_merchant" USING btree ("workspace_id","normalized_name");--> statement-breakpoint
CREATE INDEX "ledger_transaction_workspace_occurred_at_idx" ON "ledger_transaction" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_transaction_workspace_category_idx" ON "ledger_transaction" USING btree ("workspace_id","category_id");--> statement-breakpoint
CREATE INDEX "ledger_transaction_workspace_merchant_idx" ON "ledger_transaction" USING btree ("workspace_id","merchant_id");--> statement-breakpoint
CREATE INDEX "ledger_transaction_transfer_group_idx" ON "ledger_transaction" USING btree ("transfer_group_id");--> statement-breakpoint
CREATE INDEX "ledger_transaction_refunded_transaction_idx" ON "ledger_transaction" USING btree ("refunded_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transaction_workspace_fingerprint_unique" ON "ledger_transaction" USING btree ("workspace_id","deduplication_fingerprint") WHERE "ledger_transaction"."deduplication_fingerprint" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "ledger_category" ("id", "name", "kind", "is_system", "system_key")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Groceries', 'EXPENSE', true, 'expense:groceries'),
  ('00000000-0000-4000-8000-000000000002', 'Dining', 'EXPENSE', true, 'expense:dining'),
  ('00000000-0000-4000-8000-000000000003', 'Transport', 'EXPENSE', true, 'expense:transport'),
  ('00000000-0000-4000-8000-000000000004', 'Housing', 'EXPENSE', true, 'expense:housing'),
  ('00000000-0000-4000-8000-000000000005', 'Utilities', 'EXPENSE', true, 'expense:utilities'),
  ('00000000-0000-4000-8000-000000000006', 'Health', 'EXPENSE', true, 'expense:health'),
  ('00000000-0000-4000-8000-000000000007', 'Shopping', 'EXPENSE', true, 'expense:shopping'),
  ('00000000-0000-4000-8000-000000000008', 'Entertainment', 'EXPENSE', true, 'expense:entertainment'),
  ('00000000-0000-4000-8000-000000000009', 'Other expense', 'EXPENSE', true, 'expense:other'),
  ('00000000-0000-4000-8000-000000000101', 'Salary', 'INCOME', true, 'income:salary'),
  ('00000000-0000-4000-8000-000000000102', 'Freelance', 'INCOME', true, 'income:freelance'),
  ('00000000-0000-4000-8000-000000000103', 'Gift', 'INCOME', true, 'income:gift'),
  ('00000000-0000-4000-8000-000000000104', 'Other income', 'INCOME', true, 'income:other')
ON CONFLICT ("system_key") DO NOTHING;
