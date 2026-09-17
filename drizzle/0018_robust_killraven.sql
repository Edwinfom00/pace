ALTER TABLE "ledger_transaction" DROP CONSTRAINT "ledger_transaction_shape_check";--> statement-breakpoint
ALTER TABLE "ledger_transaction" ADD CONSTRAINT "ledger_transaction_shape_check" CHECK ((
        "ledger_transaction"."kind" = 'TRANSFER'
        AND "ledger_transaction"."account_id" IS NOT NULL
        AND "ledger_transaction"."transfer_account_id" IS NOT NULL
        AND "ledger_transaction"."account_id" <> "ledger_transaction"."transfer_account_id"
        AND "ledger_transaction"."category_id" IS NULL
        AND "ledger_transaction"."merchant_id" IS NULL
        AND "ledger_transaction"."refunded_transaction_id" IS NULL
        AND "ledger_transaction"."transfer_group_id" IS NOT NULL
      ) OR (
        "ledger_transaction"."kind" = 'EXPENSE'
        AND "ledger_transaction"."account_id" IS NOT NULL
        AND "ledger_transaction"."transfer_account_id" IS NULL
        AND "ledger_transaction"."refunded_transaction_id" IS NULL
        AND "ledger_transaction"."transfer_group_id" IS NULL
      ) OR (
        "ledger_transaction"."kind" = 'INCOME'
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
      ));