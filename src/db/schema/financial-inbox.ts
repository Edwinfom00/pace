import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import type { InboxAction } from "@/modules/financial-inbox/domain";

import { users } from "./auth";
import { ledgerAccounts, ledgerCategories, ledgerCategoryKind, ledgerTransactions } from "./ledger";
import { workspaces } from "./workspaces";

export const transactionClassificationSource = pgEnum("transaction_classification_source", [
  "USER_RULE",
  "DETERMINISTIC",
  "AI_SUGGESTION",
  "EXISTING_LEDGER",
  "USER_CORRECTION",
  "UNCLASSIFIED",
]);

export const transactionClassificationStatus = pgEnum("transaction_classification_status", [
  "APPLIED",
  "NEEDS_REVIEW",
  "DISMISSED",
]);

export const financialInboxReason = pgEnum("financial_inbox_reason", [
  "UNKNOWN_CATEGORY",
  "POSSIBLE_TRANSFER",
  "POSSIBLE_RECURRING",
  "MERCHANT_AMBIGUITY",
  "CLASSIFICATION_REVIEW",
]);

export const financialInboxStatus = pgEnum("financial_inbox_status", ["OPEN", "RESOLVED", "DISMISSED"]);

export const recurringPaymentStatus = pgEnum("recurring_payment_status", [
  "CANDIDATE",
  "CONFIRMED",
  "IGNORED",
]);

export const recurringPaymentOrigin = pgEnum("recurring_payment_origin", ["DETECTED", "MANUAL"]);

export const recurringPaymentDirection = pgEnum("recurring_payment_direction", ["EXPENSE", "INCOME"]);

export const transactionClassificationRules = pgTable(
  "transaction_classification_rule",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    normalizedMerchant: varchar("normalized_merchant", { length: 160 }).notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => ledgerCategories.id, { onDelete: "restrict" }),
    kind: ledgerCategoryKind("kind").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
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
    uniqueIndex("transaction_classification_rule_workspace_merchant_kind_unique").on(
      table.workspaceId,
      table.normalizedMerchant,
      table.kind,
    ),
    index("transaction_classification_rule_workspace_idx").on(table.workspaceId),
    check("transaction_classification_rule_kind_check", sql`${table.kind} IN ('EXPENSE', 'INCOME')`),
  ],
);

export const transactionClassifications = pgTable(
  "transaction_classification",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    merchantName: varchar("merchant_name", { length: 160 }),
    normalizedMerchant: varchar("normalized_merchant", { length: 160 }),
    suggestedCategoryId: text("suggested_category_id").references(() => ledgerCategories.id, {
      onDelete: "restrict",
    }),
    appliedCategoryId: text("applied_category_id").references(() => ledgerCategories.id, {
      onDelete: "restrict",
    }),
    source: transactionClassificationSource("source").notNull(),
    confidence: real("confidence").notNull(),
    status: transactionClassificationStatus("status").notNull(),
    explanation: jsonb("explanation").$type<Record<string, unknown>>().notNull().default({}),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_classification_transaction_unique").on(table.transactionId),
    index("transaction_classification_workspace_status_idx").on(table.workspaceId, table.status),
    check("transaction_classification_confidence_check", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  ],
);

export const recurringPayments = pgTable(
  "recurring_payment",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    detectionKey: varchar("detection_key", { length: 256 }).notNull(),

    normalizedMerchant: varchar("normalized_merchant", { length: 160 }),
    displayName: varchar("display_name", { length: 160 }),
    origin: recurringPaymentOrigin("origin").notNull().default("DETECTED"),
    direction: recurringPaymentDirection("direction").notNull().default("EXPENSE"),
    accountId: text("account_id").references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => ledgerCategories.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    typicalAmountMinor: bigint("typical_amount_minor", { mode: "bigint" }).notNull(),
    amountToleranceBps: integer("amount_tolerance_bps").notNull(),
    cadenceDays: integer("cadence_days").notNull(),
    firstOccurredAt: timestamp("first_occurred_at", { withTimezone: true }).notNull(),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }).notNull(),
    // A manual schedule has a user-chosen first/next date. It is an anchor for
    // informational projections, not evidence that money already moved.
    nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }),
    sampleTransactionIds: jsonb("sample_transaction_ids").$type<string[]>().notNull().default([]),
    status: recurringPaymentStatus("status").notNull().default("CANDIDATE"),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    commandFingerprint: varchar("command_fingerprint", { length: 128 }),
    confirmedByUserId: text("confirmed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ignoredByUserId: text("ignored_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    ignoredAt: timestamp("ignored_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("recurring_payment_workspace_detection_key_unique").on(
      table.workspaceId,
      table.detectionKey,
    ),
    uniqueIndex("recurring_payment_workspace_actor_key_unique")
      .on(table.workspaceId, table.createdByUserId, table.idempotencyKey)
      .where(sql`${table.createdByUserId} IS NOT NULL AND ${table.idempotencyKey} IS NOT NULL`),
    index("recurring_payment_workspace_status_idx").on(table.workspaceId, table.status),
    index("recurring_payment_workspace_origin_idx").on(table.workspaceId, table.origin),
    check("recurring_payment_amount_tolerance_check", sql`${table.amountToleranceBps} >= 0 AND ${table.amountToleranceBps} <= 10000`),
    check("recurring_payment_cadence_check", sql`${table.cadenceDays} >= 7 AND ${table.cadenceDays} <= 400`),
  ],
);

export const financialInboxItems = pgTable(
  "financial_inbox_item",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    classificationId: text("classification_id").references(() => transactionClassifications.id, {
      onDelete: "cascade",
    }),
    recurringPaymentId: text("recurring_payment_id").references(() => recurringPayments.id, {
      onDelete: "cascade",
    }),
    reason: financialInboxReason("reason").notNull(),
    actions: jsonb("actions").$type<InboxAction[]>().notNull().default([]),
    status: financialInboxStatus("status").notNull().default("OPEN"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("financial_inbox_item_workspace_status_idx").on(table.workspaceId, table.status),
    index("financial_inbox_item_transaction_idx").on(table.transactionId),
  ],
);

export const financialInboxAudits = pgTable(
  "financial_inbox_audit",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    inboxItemId: text("inbox_item_id").references(() => financialInboxItems.id, {
      onDelete: "cascade",
    }),
    classificationId: text("classification_id").references(() => transactionClassifications.id, {
      onDelete: "cascade",
    }),
    recurringPaymentId: text("recurring_payment_id").references(() => recurringPayments.id, {
      onDelete: "cascade",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    event: varchar("event", { length: 100 }).notNull(),
    commandFingerprint: varchar("command_fingerprint", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("financial_inbox_audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("financial_inbox_audit_inbox_created_idx").on(table.inboxItemId, table.createdAt),
    index("financial_inbox_audit_classification_created_idx").on(table.classificationId, table.createdAt),
    uniqueIndex("financial_inbox_audit_workspace_actor_key_unique")
      .on(table.workspaceId, table.actorUserId, table.idempotencyKey)
      .where(sql`${table.actorUserId} IS NOT NULL AND ${table.idempotencyKey} IS NOT NULL`),
  ],
);
