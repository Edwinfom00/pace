-- PostgreSQL only makes a newly-added enum value usable after this migration's
-- transaction commits. The dependent schema/data work is deliberately staged
-- and added after this migration has been applied.
ALTER TYPE "public"."ledger_transaction_kind" ADD VALUE IF NOT EXISTS 'OPENING_BALANCE';
