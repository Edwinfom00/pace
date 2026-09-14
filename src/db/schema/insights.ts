import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { workspaces } from "./workspaces";

export const insightType = pgEnum("insight_type", [
  "CATEGORY_SPIKE",
  "CATEGORY_DROP",
  "MERCHANT_SPIKE",
  "SPENDING_PACE_HIGH",
  "SPENDING_PACE_LOW",
  "BUDGET_AT_RISK",
  "BUDGET_EXCEEDED",
  "RECURRING_PRICE_INCREASE",
  "NEW_RECURRING_PAYMENT",
  "POTENTIAL_SAVINGS",
  "GOAL_OFF_TRACK",
  "GOAL_ON_TRACK",
  "UNUSUAL_TRANSACTION",
  "MONTH_OVER_MONTH_CHANGE",
]);
export const insightSeverity = pgEnum("insight_severity", ["INFO", "WARNING", "CRITICAL"]);
export const insightStatus = pgEnum("insight_status", ["ACTIVE", "READ", "DISMISSED", "RESOLVED"]);
export const insightSource = pgEnum("insight_source", ["MONEY_ENGINE"]);
export const notificationCadence = pgEnum("notification_cadence", ["DAILY", "WEEKLY", "MONTHLY"]);
export const memberNotificationStatus = pgEnum("member_notification_status", ["UNREAD", "READ"]);

/** Durable workspace facts emitted only by the deterministic Money Engine. */
export const insights = pgTable(
  "insight",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: insightType("type").notNull(),
    severity: insightSeverity("severity").notNull(),
    data: jsonb("data").$type<Record<string, string | number | boolean | null>>().notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    status: insightStatus("status").notNull().default("ACTIVE"),
    source: insightSource("source").notNull(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("insight_workspace_fingerprint_unique").on(table.workspaceId, table.fingerprint),
    index("insight_workspace_status_idx").on(table.workspaceId, table.status),
    index("insight_workspace_period_idx").on(table.workspaceId, table.periodStart, table.periodEnd),
  ],
);

/** Per-member delivery choices; the workspace's financial data remains shared. */
export const memberNotificationPreferences = pgTable(
  "member_notification_preference",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyEnabled: boolean("daily_enabled").notNull().default(true),
    weeklyEnabled: boolean("weekly_enabled").notNull().default(true),
    monthlyEnabled: boolean("monthly_enabled").notNull().default(true),
    minimumSeverity: insightSeverity("minimum_severity").notNull().default("INFO"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("member_notification_preference_user_idx").on(table.userId),
  ],
);

/** A private, durable in-product notification intent, deduplicated per member. */
export const memberNotifications = pgTable(
  "member_notification",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    insightId: text("insight_id").references(() => insights.id, { onDelete: "cascade" }),
    cadence: notificationCadence("cadence").notNull(),
    language: varchar("language", { length: 10 }).notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | boolean | null>>().notNull(),
    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),
    status: memberNotificationStatus("status").notNull().default("UNREAD"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("member_notification_member_fingerprint_unique").on(
      table.workspaceId,
      table.userId,
      table.fingerprint,
    ),
    index("member_notification_member_status_idx").on(table.workspaceId, table.userId, table.status),
  ],
);
