CREATE TABLE "ledger_opening_balance" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "account_id" text NOT NULL,
  "original_transaction_id" text NOT NULL,
  "current_transaction_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ledger_opening_balance_workspace_id_workspace_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ledger_opening_balance_account_id_ledger_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."ledger_account"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "ledger_opening_balance_original_transaction_id_ledger_transaction_id_fk"
    FOREIGN KEY ("original_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "ledger_opening_balance_current_transaction_id_ledger_transaction_id_fk"
    FOREIGN KEY ("current_transaction_id") REFERENCES "public"."ledger_transaction"("id") ON DELETE restrict ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_opening_balance_account_unique" ON "ledger_opening_balance" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_opening_balance_original_transaction_unique" ON "ledger_opening_balance" USING btree ("original_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_opening_balance_current_transaction_unique" ON "ledger_opening_balance" USING btree ("current_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_opening_balance_workspace_account_idx" ON "ledger_opening_balance" USING btree ("workspace_id", "account_id");--> statement-breakpoint

ALTER TABLE "ledger_transaction" DROP CONSTRAINT "ledger_transaction_amount_positive_check";--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_amount_positive_check"
  CHECK ("amount_minor" > 0 OR "kind" = 'OPENING_BALANCE');--> statement-breakpoint
ALTER TABLE "ledger_transaction" DROP CONSTRAINT "ledger_transaction_shape_check";--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_shape_check" CHECK (
  (
    "kind" = 'TRANSFER'
    AND "account_id" IS NOT NULL AND "transfer_account_id" IS NOT NULL
    AND "account_id" <> "transfer_account_id"
    AND "category_id" IS NULL AND "merchant_id" IS NULL
    AND "refunded_transaction_id" IS NULL AND "transfer_group_id" IS NOT NULL
  ) OR (
    "kind" = 'EXPENSE'
    AND "account_id" IS NOT NULL AND "transfer_account_id" IS NULL
    AND "refunded_transaction_id" IS NULL AND "transfer_group_id" IS NULL
  ) OR (
    "kind" = 'INCOME'
    AND "account_id" IS NOT NULL AND "transfer_account_id" IS NULL
    AND "refunded_transaction_id" IS NULL AND "transfer_group_id" IS NULL
  ) OR (
    "kind" = 'REFUND'
    AND "account_id" IS NOT NULL AND "transfer_account_id" IS NULL
    AND "category_id" IS NOT NULL AND "refunded_transaction_id" IS NOT NULL
    AND "transfer_group_id" IS NULL
  ) OR (
    "kind" = 'OPENING_BALANCE'
    AND "account_id" IS NOT NULL AND "transfer_account_id" IS NULL
    AND "category_id" IS NULL AND "merchant_id" IS NULL
    AND "refunded_transaction_id" IS NULL AND "transfer_group_id" IS NULL
  )
);--> statement-breakpoint

-- Convert the former account base value into an append-only internal ledger
-- event. Existing zero values remain represented by no event; new explicit
-- zero initializations are recorded by the canonical command for idempotency.
INSERT INTO "ledger_transaction" (
  "id", "workspace_id", "kind", "status", "amount_minor", "currency", "occurred_at",
  "account_id", "transfer_account_id", "category_id", "merchant_id",
  "created_by_user_id", "paid_by_user_id", "transfer_group_id",
  "refunded_transaction_id", "reversal_of_transaction_id", "source",
  "deduplication_fingerprint", "note", "created_at", "updated_at"
)
SELECT
  'legacy-opening-balance:' || account."id",
  account."workspace_id", 'OPENING_BALANCE', 'POSTED', account."opening_balance_minor", account."currency", account."created_at",
  account."id", NULL, NULL, NULL,
  account."created_by_user_id", NULL, NULL,
  NULL, NULL,
  jsonb_build_object('provider', 'pace-migration', 'origin', 'OPENING_BALANCE', 'legacy', true),
  'legacy-opening-balance:' || account."id", NULL, account."created_at", account."updated_at"
FROM "ledger_account" AS account
WHERE account."opening_balance_minor" <> 0;--> statement-breakpoint

INSERT INTO "ledger_opening_balance" (
  "id", "workspace_id", "account_id", "original_transaction_id", "current_transaction_id", "created_at", "updated_at"
)
SELECT
  'legacy-opening-balance-link:' || account."id",
  account."workspace_id", account."id",
  'legacy-opening-balance:' || account."id", 'legacy-opening-balance:' || account."id",
  account."created_at", account."updated_at"
FROM "ledger_account" AS account
WHERE account."opening_balance_minor" <> 0;--> statement-breakpoint

INSERT INTO "ledger_transaction_audit" (
  "id", "workspace_id", "transaction_id", "actor_user_id", "action", "metadata", "created_at"
)
SELECT
  'legacy-opening-balance-audit:' || account."id",
  account."workspace_id", 'legacy-opening-balance:' || account."id", account."created_by_user_id",
  'OPENING_BALANCE_ESTABLISHED',
  jsonb_build_object(
    'migration', '0025_opening_balance_foundation_schema',
    'amountMinor', account."opening_balance_minor"::text,
    'currency', account."currency",
    'effectiveAt', account."created_at"
  ),
  account."created_at"
FROM "ledger_account" AS account
WHERE account."opening_balance_minor" <> 0;--> statement-breakpoint

ALTER TABLE "ledger_account" DROP COLUMN "opening_balance_minor";
