import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  budgetManagementAudits,
  budgets,
  savingsGoalManagementAudits,
  savingsGoals,
} from "@/db/schema";

import type { BudgetRecord, SavingsGoalRecord } from "../domain";

export type CreateBudgetRecord = Omit<BudgetRecord, "createdAt" | "updatedAt">;
export type CreateSavingsGoalRecord = Omit<
  SavingsGoalRecord,
  "createdAt" | "updatedAt"
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
}
