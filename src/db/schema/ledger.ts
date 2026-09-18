import { sql } from "drizzle-orm";
import {
  bigint,
  type AnyPgColumn,
  boolean,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { LEDGER_ACCOUNT_TYPES } from "@/modules/ledger/domain";

import { users } from "./auth";
import { workspaces } from "./workspaces";

export const ledgerCategoryKind = pgEnum("ledger_category_kind", ["EXPENSE", "INCOME"]);
export const ledgerTransactionKind = pgEnum("ledger_transaction_kind", [
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
]);
export const ledgerTransactionStatus = pgEnum("ledger_transaction_status", ["PENDING", "POSTED"]);
export const ledgerAccountType = pgEnum("ledger_account_type", LEDGER_ACCOUNT_TYPES);

export const ledgerAccounts = pgTable(
  "ledger_account",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    type: ledgerAccountType("type").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    openingBalanceMinor: bigint("opening_balance_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_account_workspace_idx").on(table.workspaceId),
    check("ledger_account_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const ledgerCategories = pgTable(
  "ledger_category",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    kind: ledgerCategoryKind("kind").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    systemKey: varchar("system_key", { length: 120 }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_category_workspace_idx").on(table.workspaceId),
    uniqueIndex("ledger_category_system_key_unique").on(table.systemKey),
    uniqueIndex("ledger_category_workspace_name_unique")
      .on(table.workspaceId, table.kind, table.name)
      .where(sql`${table.workspaceId} IS NOT NULL`),
    check(
      "ledger_category_scope_check",
      sql`(
        ${table.isSystem} = true
        AND ${table.workspaceId} IS NULL
        AND ${table.createdByUserId} IS NULL
        AND ${table.systemKey} IS NOT NULL
      ) OR (
        ${table.isSystem} = false
        AND ${table.workspaceId} IS NOT NULL
        AND ${table.createdByUserId} IS NOT NULL
        AND ${table.systemKey} IS NULL
      )`,
    ),
  ],
);

export const ledgerMerchants = pgTable(
  "ledger_merchant",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 160 }).notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_merchant_workspace_normalized_name_unique").on(
      table.workspaceId,
      table.normalizedName,
    ),
  ],
);

export const ledgerTransactions = pgTable(
  "ledger_transaction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: ledgerTransactionKind("kind").notNull(),
    status: ledgerTransactionStatus("status").notNull().default("POSTED"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    accountId: text("account_id").references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    transferAccountId: text("transfer_account_id").references(() => ledgerAccounts.id, {
      onDelete: "restrict",
    }),
    categoryId: text("category_id").references(() => ledgerCategories.id, { onDelete: "restrict" }),
    merchantId: text("merchant_id").references(() => ledgerMerchants.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    paidByUserId: text("paid_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    transferGroupId: text("transfer_group_id"),
    refundedTransactionId: text("refunded_transaction_id").references(
      (): AnyPgColumn => ledgerTransactions.id,
      { onDelete: "restrict" },
    ),
    reversalOfTransactionId: text("reversal_of_transaction_id").references(
      (): AnyPgColumn => ledgerTransactions.id,
      { onDelete: "restrict" },
    ),
    source: jsonb("source").$type<Record<string, unknown>>().notNull().default({}),
    deduplicationFingerprint: varchar("deduplication_fingerprint", { length: 128 }),
    note: varchar("note", { length: 1_000 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_transaction_workspace_occurred_at_idx").on(table.workspaceId, table.occurredAt),
    index("ledger_transaction_workspace_category_idx").on(table.workspaceId, table.categoryId),
    index("ledger_transaction_workspace_merchant_idx").on(table.workspaceId, table.merchantId),
    index("ledger_transaction_transfer_group_idx").on(table.transferGroupId),
    index("ledger_transaction_refunded_transaction_idx").on(table.refundedTransactionId),
    index("ledger_transaction_reversal_of_transaction_idx").on(table.reversalOfTransactionId),
    uniqueIndex("ledger_transaction_workspace_fingerprint_unique")
      .on(table.workspaceId, table.deduplicationFingerprint)
      .where(sql`${table.deduplicationFingerprint} IS NOT NULL`),
    check("ledger_transaction_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("ledger_transaction_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "ledger_transaction_shape_check",
      sql`(
        ${table.kind} = 'TRANSFER'
        AND ${table.accountId} IS NOT NULL
        AND ${table.transferAccountId} IS NOT NULL
        AND ${table.accountId} <> ${table.transferAccountId}
        AND ${table.categoryId} IS NULL
        AND ${table.merchantId} IS NULL
        AND ${table.refundedTransactionId} IS NULL
        AND ${table.transferGroupId} IS NOT NULL
      ) OR (
        ${table.kind} = 'EXPENSE'
        AND ${table.accountId} IS NOT NULL
        AND ${table.transferAccountId} IS NULL
        AND ${table.refundedTransactionId} IS NULL
        AND ${table.transferGroupId} IS NULL
      ) OR (
        ${table.kind} = 'INCOME'
        AND ${table.accountId} IS NOT NULL
        AND ${table.transferAccountId} IS NULL
        AND ${table.refundedTransactionId} IS NULL
        AND ${table.transferGroupId} IS NULL
      ) OR (
        ${table.kind} = 'REFUND'
        AND ${table.accountId} IS NOT NULL
        AND ${table.transferAccountId} IS NULL
        AND ${table.categoryId} IS NOT NULL
        AND ${table.refundedTransactionId} IS NOT NULL
        AND ${table.transferGroupId} IS NULL
      )`,
    ),
  ],
);


export const ledgerTransactionCorrections = pgTable(
  "ledger_transaction_correction",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    originalTransactionId: text("original_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    reversalTransactionId: text("reversal_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    replacementTransactionId: text("replacement_transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    commandFingerprint: varchar("command_fingerprint", { length: 128 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("ledger_transaction_correction_original_unique").on(table.originalTransactionId),
    uniqueIndex("ledger_transaction_correction_reversal_unique").on(table.reversalTransactionId),
    uniqueIndex("ledger_transaction_correction_replacement_unique").on(table.replacementTransactionId),
    uniqueIndex("ledger_transaction_correction_workspace_actor_key_unique").on(
      table.workspaceId,
      table.actorUserId,
      table.idempotencyKey,
    ),
    index("ledger_transaction_correction_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);


export const ledgerTransactionAudits = pgTable(
  "ledger_transaction_audit",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 32 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ledger_transaction_audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("ledger_transaction_audit_transaction_created_idx").on(table.transactionId, table.createdAt),
  ],
);
