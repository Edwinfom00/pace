import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { ledgerCategories } from "./ledger";
import { workspaces } from "./workspaces";

export const budgetScope = pgEnum("budget_scope", ["OVERALL", "CATEGORY"]);
export const budgetFrequency = pgEnum("budget_frequency", ["MONTHLY"]);
export const budgetStatus = pgEnum("budget_status", ["ACTIVE", "ARCHIVED"]);
export const savingsGoalStatus = pgEnum("savings_goal_status", [
  "ACTIVE",
  "COMPLETED",
  "PAUSED",
  "ARCHIVED",
]);

/**
 * A budget is a monthly limit. Its calculations live in the deterministic
 * Money Engine; this table intentionally contains no derived balance.
 */
export const budgets = pgTable(
  "budget",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    scope: budgetScope("scope").notNull(),
    categoryId: text("category_id").references(() => ledgerCategories.id, {
      onDelete: "restrict",
    }),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    frequency: budgetFrequency("frequency").notNull().default("MONTHLY"),
    status: budgetStatus("status").notNull().default("ACTIVE"),
    startsOn: timestamp("starts_on", { withTimezone: true }).notNull(),
    endsOn: timestamp("ends_on", { withTimezone: true }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdByAgentActionId: text("created_by_agent_action_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("budget_workspace_status_idx").on(table.workspaceId, table.status),
    index("budget_workspace_category_idx").on(table.workspaceId, table.categoryId),
    uniqueIndex("budget_workspace_agent_action_unique")
      .on(table.workspaceId, table.createdByAgentActionId)
      .where(sql`${table.createdByAgentActionId} IS NOT NULL`),
    check("budget_amount_positive_check", sql`${table.amountMinor} > 0`),
    check("budget_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "budget_scope_shape_check",
      sql`(
        ${table.scope} = 'OVERALL' AND ${table.categoryId} IS NULL
      ) OR (
        ${table.scope} = 'CATEGORY' AND ${table.categoryId} IS NOT NULL
      )`,
    ),
    check(
      "budget_schedule_check",
      sql`${table.endsOn} IS NULL OR ${table.endsOn} >= ${table.startsOn}`,
    ),
  ],
);

/**
 * Savings are explicit user-entered progress values. They are deliberately
 * separate from account balances and from the immutable transaction ledger.
 */
export const savingsGoals = pgTable(
  "savings_goal",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    targetAmountMinor: bigint("target_amount_minor", { mode: "bigint" }).notNull(),
    currentSavedMinor: bigint("current_saved_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    currency: varchar("currency", { length: 3 }).notNull(),
    targetDate: timestamp("target_date", { withTimezone: true }),
    status: savingsGoalStatus("status").notNull().default("ACTIVE"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdByAgentActionId: text("created_by_agent_action_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("savings_goal_workspace_status_idx").on(table.workspaceId, table.status),
    uniqueIndex("savings_goal_workspace_agent_action_unique")
      .on(table.workspaceId, table.createdByAgentActionId)
      .where(sql`${table.createdByAgentActionId} IS NOT NULL`),
    check("savings_goal_target_positive_check", sql`${table.targetAmountMinor} > 0`),
    check("savings_goal_saved_nonnegative_check", sql`${table.currentSavedMinor} >= 0`),
    check("savings_goal_currency_check", sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);
