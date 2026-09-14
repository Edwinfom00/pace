import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { budgets, savingsGoals } from "@/db/schema";

import type { BudgetRecord, SavingsGoalRecord } from "../domain";

export type CreateBudgetRecord = Omit<BudgetRecord, "createdAt" | "updatedAt">;
export type CreateSavingsGoalRecord = Omit<SavingsGoalRecord, "createdAt" | "updatedAt">;

export type BudgetUpdate = Partial<
  Pick<
    BudgetRecord,
    "scope" | "categoryId" | "amountMinor" | "status" | "startsOn" | "endsOn" | "updatedByUserId"
  >
>;
export type SavingsGoalUpdate = Partial<
  Pick<
    SavingsGoalRecord,
    "name" | "targetAmountMinor" | "currentSavedMinor" | "targetDate" | "status" | "updatedByUserId"
  >
>;

export interface PlansRepository {
  createBudget(input: CreateBudgetRecord): Promise<BudgetRecord>;
  findBudget(workspaceId: string, budgetId: string): Promise<BudgetRecord | null>;
  findBudgetByAgentAction(workspaceId: string, agentActionId: string): Promise<BudgetRecord | null>;
  listBudgets(workspaceId: string): Promise<BudgetRecord[]>;
  updateBudget(workspaceId: string, budgetId: string, input: BudgetUpdate): Promise<BudgetRecord | null>;
  createSavingsGoal(input: CreateSavingsGoalRecord): Promise<SavingsGoalRecord>;
  findSavingsGoal(workspaceId: string, goalId: string): Promise<SavingsGoalRecord | null>;
  findSavingsGoalByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<SavingsGoalRecord | null>;
  listSavingsGoals(workspaceId: string): Promise<SavingsGoalRecord[]>;
  updateSavingsGoal(
    workspaceId: string,
    goalId: string,
    input: SavingsGoalUpdate,
  ): Promise<SavingsGoalRecord | null>;
}

export class DatabasePlansRepository implements PlansRepository {
  async createBudget(input: CreateBudgetRecord): Promise<BudgetRecord> {
    const [record] = await db.insert(budgets).values(input).returning();
    if (!record) throw new Error("Failed to create budget.");
    return record;
  }

  async findBudget(workspaceId: string, budgetId: string): Promise<BudgetRecord | null> {
    const [record] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.id, budgetId)))
      .limit(1);
    return record ?? null;
  }

  async findBudgetByAgentAction(workspaceId: string, agentActionId: string): Promise<BudgetRecord | null> {
    const [record] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.createdByAgentActionId, agentActionId)))
      .limit(1);
    return record ?? null;
  }

  async listBudgets(workspaceId: string): Promise<BudgetRecord[]> {
    return db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)).orderBy(asc(budgets.createdAt));
  }

  async updateBudget(workspaceId: string, budgetId: string, input: BudgetUpdate): Promise<BudgetRecord | null> {
    const [record] = await db
      .update(budgets)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.id, budgetId)))
      .returning();
    return record ?? null;
  }

  async createSavingsGoal(input: CreateSavingsGoalRecord): Promise<SavingsGoalRecord> {
    const [record] = await db.insert(savingsGoals).values(input).returning();
    if (!record) throw new Error("Failed to create savings goal.");
    return record;
  }

  async findSavingsGoal(workspaceId: string, goalId: string): Promise<SavingsGoalRecord | null> {
    const [record] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.workspaceId, workspaceId), eq(savingsGoals.id, goalId)))
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
  ): Promise<SavingsGoalRecord | null> {
    const [record] = await db
      .update(savingsGoals)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(savingsGoals.workspaceId, workspaceId), eq(savingsGoals.id, goalId)))
      .returning();
    return record ?? null;
  }
}
