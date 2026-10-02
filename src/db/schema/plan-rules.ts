import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import type { RuleAction, RuleCondition } from "@/modules/plans/rules/domain";

import { users } from "./auth";
import { ledgerTransactions } from "./ledger";
import { workspaces } from "./workspaces";

export const planRules = pgTable(
  "plan_rule",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull(),
    trigger: varchar("trigger", { length: 32 }).notNull(),
    conditions: jsonb("conditions").$type<RuleCondition[]>().notNull(),
    action: jsonb("action").$type<RuleAction>().notNull(),
    revision: integer("revision").notNull().default(1),
    origin: varchar("origin", { length: 16 }).notNull().default("USER"),
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
    index("plan_rule_workspace_status_priority_idx").on(
      table.workspaceId,
      table.status,
      table.priority,
    ),
    uniqueIndex("plan_rule_workspace_agent_action_unique")
      .on(table.workspaceId, table.createdByAgentActionId)
      .where(sql`${table.createdByAgentActionId} IS NOT NULL`),
    check("plan_rule_status_check", sql`${table.status} IN ('ACTIVE', 'ARCHIVED')`),
    check("plan_rule_origin_check", sql`${table.origin} IN ('USER', 'AGENT')`),
    check("plan_rule_trigger_check", sql`${table.trigger} IN ('TRANSACTION_CREATED')`),
    check("plan_rule_priority_check", sql`${table.priority} BETWEEN 1 AND 10000`),
    check("plan_rule_revision_check", sql`${table.revision} >= 1`),
    check(
      "plan_rule_archived_disabled_check",
      sql`${table.status} = 'ACTIVE' OR ${table.enabled} = false`,
    ),
  ],
);

export const planRuleManagementAudits = pgTable(
  "plan_rule_management_audit",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => planRules.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: varchar("action", { length: 16 }).notNull(),
    commandFingerprint: varchar("command_fingerprint", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_rule_management_audit_workspace_actor_key_unique").on(
      table.workspaceId,
      table.actorUserId,
      table.idempotencyKey,
    ),
    index("plan_rule_management_audit_rule_idx").on(table.workspaceId, table.ruleId),
    check(
      "plan_rule_management_audit_action_check",
      sql`${table.action} IN ('CREATE', 'UPDATE', 'ENABLE', 'DISABLE', 'ARCHIVE')`,
    ),
  ],
);

export const planRuleExecutions = pgTable(
  "plan_rule_execution",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ruleId: text("rule_id")
      .notNull()
      .references(() => planRules.id, { onDelete: "restrict" }),
    ruleRevision: integer("rule_revision").notNull(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: "cascade" }),
    trigger: varchar("trigger", { length: 32 }).notNull(),
    actionType: varchar("action_type", { length: 32 }).notNull(),
    outcome: varchar("outcome", { length: 24 }).notNull(),
    reason: varchar("reason", { length: 64 }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    explanation: jsonb("explanation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    result: jsonb("result")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("plan_rule_execution_rule_revision_transaction_unique").on(
      table.workspaceId,
      table.ruleId,
      table.ruleRevision,
      table.transactionId,
    ),
    index("plan_rule_execution_workspace_transaction_idx").on(
      table.workspaceId,
      table.transactionId,
    ),
    check(
      "plan_rule_execution_outcome_check",
      sql`${table.outcome} IN ('PENDING', 'APPLIED', 'SKIPPED', 'SHADOWED', 'FAILED')`,
    ),
    check(
      "plan_rule_execution_action_type_check",
      sql`${table.actionType} IN ('ASSIGN_CATEGORY', 'ROUTE_FOR_REVIEW')`,
    ),
  ],
);
