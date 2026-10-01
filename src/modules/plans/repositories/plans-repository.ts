import { and, asc, eq, sql } from "drizzle-orm";

import { db, neonSql } from "@/db/client";
import {
  budgetManagementAudits,
  budgets,
  savingsGoalManagementAudits,
  savingsGoals,
  savingsGoalContributions,
} from "@/db/schema";

import type {
  BudgetRecord,
  SavingsGoalContribution,
  SavingsGoalRecord,
} from "../domain";

export type CreateBudgetRecord = Omit<BudgetRecord, "createdAt" | "updatedAt">;
export type CreateSavingsGoalRecord = Omit<
  SavingsGoalRecord,
  "createdAt" | "updatedAt"
>;
export type CreateSavingsGoalContribution = Omit<
  SavingsGoalContribution,
  "createdAt"
>;

export type BudgetUpdate = Partial<
  Pick<
    BudgetRecord,
    | "scope"
    | "categoryId"
    | "subcategoryIds"
    | "amountMinor"
    | "status"
    | "startsOn"
    | "endsOn"
    | "updatedByUserId"
  >
>;
export interface BudgetManagementAudit {
  readonly id: string;
  readonly workspaceId: string;
  readonly budgetId: string;
  readonly actorUserId: string;
  readonly action: "EDIT" | "ARCHIVE";
  readonly commandFingerprint: string;
  readonly idempotencyKey: string;
}
export interface SavingsGoalManagementAudit {
  readonly id: string;
  readonly workspaceId: string;
  readonly goalId: string;
  readonly actorUserId: string;
  readonly action: "EDIT" | "ARCHIVE" | "COMPLETE";
  readonly commandFingerprint: string;
  readonly idempotencyKey: string;
}
export type SavingsGoalUpdate = Partial<
  Pick<
    SavingsGoalRecord,
    | "name"
    | "targetAmountMinor"
    | "currentSavedMinor"
    | "targetDate"
    | "status"
    | "updatedByUserId"
  >
>;

export interface PlansRepository {
  createBudget(input: CreateBudgetRecord): Promise<BudgetRecord>;
  findBudget(
    workspaceId: string,
    budgetId: string,
  ): Promise<BudgetRecord | null>;
  findBudgetByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<BudgetRecord | null>;
  listBudgets(workspaceId: string): Promise<BudgetRecord[]>;
  updateBudget(
    workspaceId: string,
    budgetId: string,
    input: BudgetUpdate,
    expectedUpdatedAt?: Date,
  ): Promise<BudgetRecord | null>;
  findBudgetManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<BudgetManagementAudit | null>;
  createBudgetManagementAudit(input: BudgetManagementAudit): Promise<void>;
  createSavingsGoal(input: CreateSavingsGoalRecord): Promise<SavingsGoalRecord>;
  findSavingsGoal(
    workspaceId: string,
    goalId: string,
  ): Promise<SavingsGoalRecord | null>;
  findSavingsGoalByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<SavingsGoalRecord | null>;
  listSavingsGoals(workspaceId: string): Promise<SavingsGoalRecord[]>;
  updateSavingsGoal(
    workspaceId: string,
    goalId: string,
    input: SavingsGoalUpdate,
    expectedUpdatedAt?: Date,
  ): Promise<SavingsGoalRecord | null>;
  findSavingsGoalManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<SavingsGoalManagementAudit | null>;
  createSavingsGoalManagementAudit(
    input: SavingsGoalManagementAudit,
  ): Promise<void>;
  listSavingsGoalContributions(
    workspaceId: string,
    goalId: string,
  ): Promise<SavingsGoalContribution[]>;
  findSavingsGoalContribution(
    workspaceId: string,
    contributionId: string,
  ): Promise<SavingsGoalContribution | null>;
  findSavingsGoalContributionByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<SavingsGoalContribution | null>;
  recordSavingsGoalContributions(input: {
    goalId: string;
    workspaceId: string;
    expectedUpdatedAt: Date;
    updatedByUserId: string;
    status: SavingsGoalRecord["status"];
    contributions: readonly CreateSavingsGoalContribution[];
  }): Promise<SavingsGoalRecord | null>;
}

export class DatabasePlansRepository implements PlansRepository {
  async createBudget(input: CreateBudgetRecord): Promise<BudgetRecord> {
    const [record] = await db
      .insert(budgets)
      .values({ ...input, subcategoryIds: [...input.subcategoryIds] })
      .returning();
    if (!record) throw new Error("Failed to create budget.");
    return record;
  }

  async findBudget(
    workspaceId: string,
    budgetId: string,
  ): Promise<BudgetRecord | null> {
    const [record] = await db
      .select()
      .from(budgets)
      .where(
        and(eq(budgets.workspaceId, workspaceId), eq(budgets.id, budgetId)),
      )
      .limit(1);
    return record ?? null;
  }

  async findBudgetByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<BudgetRecord | null> {
    const [record] = await db
      .select()
      .from(budgets)
      .where(
        and(
          eq(budgets.workspaceId, workspaceId),
          eq(budgets.createdByAgentActionId, agentActionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async listBudgets(workspaceId: string): Promise<BudgetRecord[]> {
    return db
      .select()
      .from(budgets)
      .where(eq(budgets.workspaceId, workspaceId))
      .orderBy(asc(budgets.createdAt));
  }

  async updateBudget(
    workspaceId: string,
    budgetId: string,
    input: BudgetUpdate,
    expectedUpdatedAt?: Date,
  ): Promise<BudgetRecord | null> {
    const { subcategoryIds, ...update } = input;
    const [record] = await db
      .update(budgets)
      .set({
        ...update,
        ...(subcategoryIds ? { subcategoryIds: [...subcategoryIds] } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(budgets.workspaceId, workspaceId),
          eq(budgets.id, budgetId),
          ...(expectedUpdatedAt
            ? [
                sql`date_trunc('milliseconds', ${budgets.updatedAt}) = ${expectedUpdatedAt}`,
              ]
            : []),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findBudgetManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<BudgetManagementAudit | null> {
    const [record] = await db
      .select()
      .from(budgetManagementAudits)
      .where(
        and(
          eq(budgetManagementAudits.workspaceId, workspaceId),
          eq(budgetManagementAudits.actorUserId, actorUserId),
          eq(budgetManagementAudits.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record
      ? {
          id: record.id,
          workspaceId: record.workspaceId,
          budgetId: record.budgetId,
          actorUserId: record.actorUserId,
          action: record.action as BudgetManagementAudit["action"],
          commandFingerprint: record.commandFingerprint,
          idempotencyKey: record.idempotencyKey,
        }
      : null;
  }
  async createBudgetManagementAudit(
    input: BudgetManagementAudit,
  ): Promise<void> {
    await db.insert(budgetManagementAudits).values({ ...input, metadata: {} });
  }

  async createSavingsGoal(
    input: CreateSavingsGoalRecord,
  ): Promise<SavingsGoalRecord> {
    const [record] = await db.insert(savingsGoals).values(input).returning();
    if (!record) throw new Error("Failed to create savings goal.");
    return record;
  }

  async findSavingsGoal(
    workspaceId: string,
    goalId: string,
  ): Promise<SavingsGoalRecord | null> {
    const [record] = await db
      .select()
      .from(savingsGoals)
      .where(
        and(
          eq(savingsGoals.workspaceId, workspaceId),
          eq(savingsGoals.id, goalId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async findSavingsGoalByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<SavingsGoalRecord | null> {
    const [record] = await db
      .select()
      .from(savingsGoals)
      .where(
        and(
          eq(savingsGoals.workspaceId, workspaceId),
          eq(savingsGoals.createdByAgentActionId, agentActionId),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  async listSavingsGoals(workspaceId: string): Promise<SavingsGoalRecord[]> {
    return db
      .select()
      .from(savingsGoals)
      .where(eq(savingsGoals.workspaceId, workspaceId))
      .orderBy(asc(savingsGoals.createdAt));
  }

  async updateSavingsGoal(
    workspaceId: string,
    goalId: string,
    input: SavingsGoalUpdate,
    expectedUpdatedAt?: Date,
  ): Promise<SavingsGoalRecord | null> {
    const [record] = await db
      .update(savingsGoals)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(savingsGoals.workspaceId, workspaceId),
          eq(savingsGoals.id, goalId),
          ...(expectedUpdatedAt
            ? [
                sql`date_trunc('milliseconds', ${savingsGoals.updatedAt}) = ${expectedUpdatedAt}`,
              ]
            : []),
        ),
      )
      .returning();
    return record ?? null;
  }

  async findSavingsGoalManagementAudit(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<SavingsGoalManagementAudit | null> {
    const [record] = await db
      .select()
      .from(savingsGoalManagementAudits)
      .where(
        and(
          eq(savingsGoalManagementAudits.workspaceId, workspaceId),
          eq(savingsGoalManagementAudits.actorUserId, actorUserId),
          eq(savingsGoalManagementAudits.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record
      ? {
          id: record.id,
          workspaceId: record.workspaceId,
          goalId: record.goalId,
          actorUserId: record.actorUserId,
          action: record.action as SavingsGoalManagementAudit["action"],
          commandFingerprint: record.commandFingerprint,
          idempotencyKey: record.idempotencyKey,
        }
      : null;
  }

  async createSavingsGoalManagementAudit(
    input: SavingsGoalManagementAudit,
  ): Promise<void> {
    await db
      .insert(savingsGoalManagementAudits)
      .values({ ...input, metadata: {} });
  }

  async listSavingsGoalContributions(
    workspaceId: string,
    goalId: string,
  ): Promise<SavingsGoalContribution[]> {
    return (
      await db
        .select()
        .from(savingsGoalContributions)
        .where(
          and(
            eq(savingsGoalContributions.workspaceId, workspaceId),
            eq(savingsGoalContributions.goalId, goalId),
          ),
        )
        .orderBy(
          asc(savingsGoalContributions.effectiveAt),
          asc(savingsGoalContributions.createdAt),
        )
    ).map(toContribution);
  }
  async findSavingsGoalContribution(
    workspaceId: string,
    contributionId: string,
  ): Promise<SavingsGoalContribution | null> {
    const [record] = await db
      .select()
      .from(savingsGoalContributions)
      .where(
        and(
          eq(savingsGoalContributions.workspaceId, workspaceId),
          eq(savingsGoalContributions.id, contributionId),
        ),
      )
      .limit(1);
    return record ? toContribution(record) : null;
  }
  async findSavingsGoalContributionByIdempotencyKey(
    workspaceId: string,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<SavingsGoalContribution | null> {
    const [record] = await db
      .select()
      .from(savingsGoalContributions)
      .where(
        and(
          eq(savingsGoalContributions.workspaceId, workspaceId),
          eq(savingsGoalContributions.actorUserId, actorUserId),
          eq(savingsGoalContributions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return record ? toContribution(record) : null;
  }
  async recordSavingsGoalContributions(input: {
    goalId: string;
    workspaceId: string;
    expectedUpdatedAt: Date;
    updatedByUserId: string;
    status: SavingsGoalRecord["status"];
    contributions: readonly CreateSavingsGoalContribution[];
  }): Promise<SavingsGoalRecord | null> {
    const contributions = JSON.stringify(
      input.contributions.map((contribution) => ({
        id: contribution.id,
        workspace_id: contribution.workspaceId,
        goal_id: contribution.goalId,
        kind: contribution.kind,
        amount_minor: contribution.amountMinor.toString(),
        currency: contribution.currency,
        effective_at: contribution.effectiveAt.toISOString(),
        note: contribution.note,
        reverses_contribution_id: contribution.reversesContributionId,
        actor_user_id: contribution.actorUserId,
        idempotency_key: contribution.idempotencyKey,
        command_fingerprint: contribution.commandFingerprint,
      })),
    );
    const rows = await neonSql`
      WITH updated AS (
        UPDATE savings_goal AS goal
        SET
          updated_by_user_id = ${input.updatedByUserId},
          status = ${input.status},
          updated_at = greatest(clock_timestamp(), goal.updated_at + interval '1 millisecond')
        WHERE goal.workspace_id = ${input.workspaceId}
          AND goal.id = ${input.goalId}
          AND date_trunc('milliseconds', goal.updated_at) = ${input.expectedUpdatedAt}
        RETURNING
          goal.id,
          goal.workspace_id AS "workspaceId",
          goal.name,
          goal.target_amount_minor AS "targetAmountMinor",
          goal.current_saved_minor AS "currentSavedMinor",
          goal.currency,
          goal.target_date AS "targetDate",
          goal.status::text AS status,
          goal.created_by_user_id AS "createdByUserId",
          goal.updated_by_user_id AS "updatedByUserId",
          goal.created_by_agent_action_id AS "createdByAgentActionId",
          goal.created_at AS "createdAt",
          goal.updated_at AS "updatedAt"
      ),
      inserted AS (
        INSERT INTO savings_goal_contribution (
          id, workspace_id, goal_id, kind, amount_minor, currency, effective_at,
          note, reverses_contribution_id, actor_user_id, idempotency_key, command_fingerprint
        )
        SELECT
          contribution.id, contribution.workspace_id, contribution.goal_id,
          contribution.kind, contribution.amount_minor, contribution.currency,
          contribution.effective_at, contribution.note,
          contribution.reverses_contribution_id, contribution.actor_user_id,
          contribution.idempotency_key, contribution.command_fingerprint
        FROM jsonb_to_recordset(${contributions}::jsonb) AS contribution(
          id text,
          workspace_id text,
          goal_id text,
          kind varchar(16),
          amount_minor bigint,
          currency varchar(3),
          effective_at timestamptz,
          note varchar(500),
          reverses_contribution_id text,
          actor_user_id text,
          idempotency_key varchar(180),
          command_fingerprint varchar(128)
        )
        INNER JOIN updated ON updated.id = contribution.goal_id
        RETURNING id
      )
      SELECT updated.*
      FROM updated
      WHERE (SELECT count(*) FROM inserted) = ${input.contributions.length};
    `;
    const record = (rows as unknown as readonly RawSavingsGoalRecord[])[0];
    return record ? mapSavingsGoalRecord(record) : null;
  }
}

type RawSavingsGoalRecord = Omit<
  SavingsGoalRecord,
  "targetAmountMinor" | "currentSavedMinor" | "targetDate" | "createdAt" | "updatedAt"
> & {
  targetAmountMinor: bigint | string | number;
  currentSavedMinor: bigint | string | number;
  targetDate: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

function mapSavingsGoalRecord(record: RawSavingsGoalRecord): SavingsGoalRecord {
  return {
    ...record,
    targetAmountMinor:
      typeof record.targetAmountMinor === "bigint"
        ? record.targetAmountMinor
        : BigInt(record.targetAmountMinor),
    currentSavedMinor:
      typeof record.currentSavedMinor === "bigint"
        ? record.currentSavedMinor
        : BigInt(record.currentSavedMinor),
    targetDate: record.targetDate === null ? null : new Date(record.targetDate),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

function toContribution(
  record: typeof savingsGoalContributions.$inferSelect,
): SavingsGoalContribution {
  return { ...record, kind: record.kind as SavingsGoalContribution["kind"] };
}
