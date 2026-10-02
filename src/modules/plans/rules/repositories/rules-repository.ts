import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { planRuleExecutions, planRuleManagementAudits, planRules } from "@/db/schema";

import type {
  RuleActionSkipReason,
  RuleExecutionOutcome,
  RuleExecutionRecord,
  RuleManagementAuditRecord,
  RuleRecord,
  RuleStatus,
} from "../domain";

export type CreateRuleRecord = Omit<RuleRecord, "createdAt" | "updatedAt"> & { readonly createdAt: Date };
export type CreateRuleManagementAudit = Omit<RuleManagementAuditRecord, "createdAt">;
export type CreateRuleExecution = Omit<RuleExecutionRecord, "createdAt" | "updatedAt">;

export type RuleUpdate = Partial<
  Pick<RuleRecord, "name" | "priority" | "trigger" | "conditions" | "action" | "revision" | "enabled" | "status">
> & { readonly updatedByUserId: string; readonly updatedAt: Date };

export interface RuleExecutionCompletion {
  readonly outcome: Exclude<RuleExecutionOutcome, "PENDING">;
  readonly reason: RuleActionSkipReason | null;
  readonly result: Record<string, unknown>;
}

export type RuleExecutionClaim =
  | { readonly claimed: true; readonly execution: RuleExecutionRecord }
  | { readonly claimed: false; readonly execution: RuleExecutionRecord };

export interface RulesRepository {
  createRule(rule: CreateRuleRecord, audit: CreateRuleManagementAudit): Promise<RuleRecord>;
  findRule(workspaceId: string, ruleId: string): Promise<RuleRecord | null>;
  findRuleByAgentAction(workspaceId: string, agentActionId: string): Promise<RuleRecord | null>;
  listRules(workspaceId: string, status?: RuleStatus): Promise<RuleRecord[]>;
  updateRule(
    workspaceId: string,
    ruleId: string,
    update: RuleUpdate,
    expectedUpdatedAt: Date,
    audit: CreateRuleManagementAudit,
  ): Promise<RuleRecord | null>;
  findManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RuleManagementAuditRecord | null>;
  listManagementAudits(workspaceId: string, ruleId: string): Promise<RuleManagementAuditRecord[]>;
  claimExecution(input: CreateRuleExecution): Promise<RuleExecutionClaim>;
  completeExecution(
    workspaceId: string,
    executionId: string,
    completion: RuleExecutionCompletion,
  ): Promise<RuleExecutionRecord>;
  listExecutions(
    workspaceId: string,
    filters: { readonly ruleId?: string; readonly transactionId?: string },
  ): Promise<RuleExecutionRecord[]>;
}

type RuleRow = typeof planRules.$inferSelect;
type AuditRow = typeof planRuleManagementAudits.$inferSelect;
type ExecutionRow = typeof planRuleExecutions.$inferSelect;

function toRule(row: RuleRow): RuleRecord {
  return {
    ...row,
    status: row.status as RuleRecord["status"],
    trigger: row.trigger as RuleRecord["trigger"],
    origin: row.origin as RuleRecord["origin"],
  };
}

function toAudit(row: AuditRow): RuleManagementAuditRecord {
  return { ...row, action: row.action as RuleManagementAuditRecord["action"] };
}

function toExecution(row: ExecutionRow): RuleExecutionRecord {
  return {
    ...row,
    trigger: row.trigger as RuleExecutionRecord["trigger"],
    actionType: row.actionType as RuleExecutionRecord["actionType"],
    outcome: row.outcome as RuleExecutionRecord["outcome"],
    reason: row.reason as RuleExecutionRecord["reason"],
  };
}

export class DatabaseRulesRepository implements RulesRepository {
  async createRule(rule: CreateRuleRecord, audit: CreateRuleManagementAudit): Promise<RuleRecord> {
    const [[record]] = await db.batch([
      db
        .insert(planRules)
        .values({
          ...rule,
          conditions: [...rule.conditions],
          updatedAt: rule.createdAt,
        })
        .returning(),
      db.insert(planRuleManagementAudits).values(audit),
    ]);
    if (!record) throw new Error("Failed to create rule.");
    return toRule(record);
  }

  async findRule(workspaceId: string, ruleId: string): Promise<RuleRecord | null> {
    const [record] = await db
      .select()
      .from(planRules)
      .where(and(eq(planRules.workspaceId, workspaceId), eq(planRules.id, ruleId)))
      .limit(1);
    return record ? toRule(record) : null;
  }

  async findRuleByAgentAction(workspaceId: string, agentActionId: string): Promise<RuleRecord | null> {
    const [record] = await db
      .select()
      .from(planRules)
      .where(and(eq(planRules.workspaceId, workspaceId), eq(planRules.createdByAgentActionId, agentActionId)))
      .limit(1);
    return record ? toRule(record) : null;
  }

  async listRules(workspaceId: string, status?: RuleStatus): Promise<RuleRecord[]> {
    const rows = await db
      .select()
      .from(planRules)
      .where(
        status
          ? and(eq(planRules.workspaceId, workspaceId), eq(planRules.status, status))
          : eq(planRules.workspaceId, workspaceId),
      )
      .orderBy(asc(planRules.priority), asc(planRules.createdAt), asc(planRules.id));
    return rows.map(toRule);
  }

  async updateRule(
    workspaceId: string,
    ruleId: string,
    update: RuleUpdate,
    expectedUpdatedAt: Date,
    audit: CreateRuleManagementAudit,
  ): Promise<RuleRecord | null> {
    const { conditions, ...rest } = update;
    const [updatedRows] = await db.batch([
      db
        .update(planRules)
        .set({ ...rest, ...(conditions ? { conditions: [...conditions] } : {}) })
        .where(
          and(
            eq(planRules.workspaceId, workspaceId),
            eq(planRules.id, ruleId),
            eq(planRules.updatedAt, expectedUpdatedAt),
          ),
        )
        .returning(),
      db.execute(sql`
        INSERT INTO ${planRuleManagementAudits}
          ("id", "workspace_id", "rule_id", "actor_user_id", "action", "command_fingerprint", "idempotency_key", "metadata")
        SELECT ${audit.id}, ${audit.workspaceId}, ${audit.ruleId}, ${audit.actorUserId}, ${audit.action},
               ${audit.commandFingerprint}, ${audit.idempotencyKey}, ${JSON.stringify(audit.metadata)}::jsonb
        WHERE EXISTS (
          SELECT 1 FROM ${planRules}
          WHERE ${planRules.id} = ${ruleId}
            AND ${planRules.workspaceId} = ${workspaceId}
            AND ${planRules.updatedAt} = ${update.updatedAt.toISOString()}::timestamptz
        )
      `),
    ]);
    const [record] = updatedRows;
    return record ? toRule(record) : null;
  }

  async findManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<RuleManagementAuditRecord | null> {
    const [record] = await db
      .select()
      .from(planRuleManagementAudits)
      .where(
        and(
          eq(planRuleManagementAudits.workspaceId, workspaceId),
          eq(planRuleManagementAudits.actorUserId, actorUserId),
          eq(planRuleManagementAudits.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ? toAudit(record) : null;
  }

  async listManagementAudits(workspaceId: string, ruleId: string): Promise<RuleManagementAuditRecord[]> {
    const rows = await db
      .select()
      .from(planRuleManagementAudits)
      .where(and(eq(planRuleManagementAudits.workspaceId, workspaceId), eq(planRuleManagementAudits.ruleId, ruleId)))
      .orderBy(asc(planRuleManagementAudits.createdAt));
    return rows.map(toAudit);
  }

  async claimExecution(input: CreateRuleExecution): Promise<RuleExecutionClaim> {
    const [inserted] = await db
      .insert(planRuleExecutions)
      .values(input)
      .onConflictDoNothing({
        target: [
          planRuleExecutions.workspaceId,
          planRuleExecutions.ruleId,
          planRuleExecutions.ruleRevision,
          planRuleExecutions.transactionId,
        ],
      })
      .returning();
    if (inserted) return { claimed: true, execution: toExecution(inserted) };
    const [existing] = await db
      .select()
      .from(planRuleExecutions)
      .where(
        and(
          eq(planRuleExecutions.workspaceId, input.workspaceId),
          eq(planRuleExecutions.ruleId, input.ruleId),
          eq(planRuleExecutions.ruleRevision, input.ruleRevision),
          eq(planRuleExecutions.transactionId, input.transactionId),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("Rule execution claim could not be resolved.");
    return { claimed: false, execution: toExecution(existing) };
  }

  async completeExecution(
    workspaceId: string,
    executionId: string,
    completion: RuleExecutionCompletion,
  ): Promise<RuleExecutionRecord> {
    const [record] = await db
      .update(planRuleExecutions)
      .set({ ...completion, updatedAt: new Date() })
      .where(
        and(
          eq(planRuleExecutions.workspaceId, workspaceId),
          eq(planRuleExecutions.id, executionId),
          eq(planRuleExecutions.outcome, "PENDING"),
        ),
      )
      .returning();
    if (!record) throw new Error("Rule execution could not be completed.");
    return toExecution(record);
  }

  async listExecutions(
    workspaceId: string,
    filters: { readonly ruleId?: string; readonly transactionId?: string },
  ): Promise<RuleExecutionRecord[]> {
    const rows = await db
      .select()
      .from(planRuleExecutions)
      .where(
        and(
          eq(planRuleExecutions.workspaceId, workspaceId),
          filters.ruleId ? eq(planRuleExecutions.ruleId, filters.ruleId) : undefined,
          filters.transactionId ? eq(planRuleExecutions.transactionId, filters.transactionId) : undefined,
        ),
      )
      .orderBy(desc(planRuleExecutions.createdAt));
    return rows.map(toExecution);
  }
}
