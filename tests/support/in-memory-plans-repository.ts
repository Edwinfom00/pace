import type { BudgetRecord, SavingsGoalRecord } from "@/modules/plans/domain";
import type {
  BudgetUpdate,
  CreateBudgetRecord,
  CreateSavingsGoalRecord,
  PlansRepository,
  SavingsGoalUpdate,
} from "@/modules/plans/repositories/plans-repository";

export class InMemoryPlansRepository implements PlansRepository {
  readonly budgets = new Map<string, BudgetRecord>();
  readonly goals = new Map<string, SavingsGoalRecord>();

  async createBudget(input: CreateBudgetRecord): Promise<BudgetRecord> {
    const now = new Date();
    const record: BudgetRecord = { ...input, createdAt: now, updatedAt: now };
    this.budgets.set(record.id, record);
    return record;
  }

  async findBudget(workspaceId: string, budgetId: string): Promise<BudgetRecord | null> {
    const record = this.budgets.get(budgetId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findBudgetByAgentAction(workspaceId: string, agentActionId: string): Promise<BudgetRecord | null> {
    return [...this.budgets.values()].find(
      (record) => record.workspaceId === workspaceId && record.createdByAgentActionId === agentActionId,
    ) ?? null;
  }

  async listBudgets(workspaceId: string): Promise<BudgetRecord[]> {
    return [...this.budgets.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async updateBudget(workspaceId: string, budgetId: string, input: BudgetUpdate): Promise<BudgetRecord | null> {
    const current = await this.findBudget(workspaceId, budgetId);
    if (!current) return null;
    const updated: BudgetRecord = { ...current, ...input, updatedAt: new Date() };
    this.budgets.set(budgetId, updated);
    return updated;
  }

  async createSavingsGoal(input: CreateSavingsGoalRecord): Promise<SavingsGoalRecord> {
    const now = new Date();
    const record: SavingsGoalRecord = { ...input, createdAt: now, updatedAt: now };
    this.goals.set(record.id, record);
    return record;
  }

  async findSavingsGoal(workspaceId: string, goalId: string): Promise<SavingsGoalRecord | null> {
    const record = this.goals.get(goalId);
    return record?.workspaceId === workspaceId ? record : null;
  }

  async findSavingsGoalByAgentAction(
    workspaceId: string,
    agentActionId: string,
  ): Promise<SavingsGoalRecord | null> {
    return [...this.goals.values()].find(
      (record) => record.workspaceId === workspaceId && record.createdByAgentActionId === agentActionId,
    ) ?? null;
  }

  async listSavingsGoals(workspaceId: string): Promise<SavingsGoalRecord[]> {
    return [...this.goals.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async updateSavingsGoal(
    workspaceId: string,
    goalId: string,
    input: SavingsGoalUpdate,
  ): Promise<SavingsGoalRecord | null> {
    const current = await this.findSavingsGoal(workspaceId, goalId);
    if (!current) return null;
    const updated: SavingsGoalRecord = { ...current, ...input, updatedAt: new Date() };
    this.goals.set(goalId, updated);
    return updated;
  }
}
