import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

import type { AgentActionResult, TransactionDraft } from "@/modules/agent-actions/domain";

import { users } from "./auth";
import { workspaces } from "./workspaces";

export const agentActionStatus = pgEnum("agent_action_status", [
  "DRAFT",
  "WAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
]);

export const agentActionType = pgEnum("agent_action_type", ["TRANSACTION_CREATE"]);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: agentActionType("type").notNull(),
    status: agentActionStatus("status").notNull().default("DRAFT"),
    initiatedByUserId: text("initiated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    draft: jsonb("draft").$type<TransactionDraft>().notNull(),
    result: jsonb("result").$type<AgentActionResult>(),
    failureCode: varchar("failure_code", { length: 120 }),
    failureMessage: varchar("failure_message", { length: 1_000 }),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    eveSessionId: text("eve_session_id"),
    eveCallId: text("eve_call_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_actions_workspace_status_idx").on(table.workspaceId, table.status),
    index("agent_actions_initiated_by_idx").on(table.initiatedByUserId),
    uniqueIndex("agent_actions_workspace_idempotency_unique").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("agent_actions_eve_session_idx").on(table.eveSessionId),
  ],
);

export const agentActionAudits = pgTable(
  "agent_action_audit",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => agentActions.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    event: varchar("event", { length: 80 }).notNull(),
    fromStatus: agentActionStatus("from_status"),
    toStatus: agentActionStatus("to_status"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_action_audit_action_created_idx").on(table.actionId, table.createdAt),
    index("agent_action_audit_workspace_created_idx").on(table.workspaceId, table.createdAt),
    // This ensures a status transition is always attributable to an action in
    // the same tenant; application services additionally enforce membership.
    index("agent_action_audit_status_idx").on(table.toStatus),
  ],
);
