import { randomUUID } from "node:crypto";

import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { calculateDailyPace, summarizePeriod } from "@/money/engine";
import { localDateForInstant, localDateKey, periodForLocalDates } from "@/money/period";
import {
  isUserFacingLedgerTransaction,
  type LedgerCategoryRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceMemberContext } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  BudgetRecord,
  BudgetScope,
  BudgetStatus,
  BudgetSummary,
  SavingsGoalRecord,
  SavingsGoalStatus,
  SavingsGoalSummary,
} from "./domain";
import type { BudgetUpdate, PlansRepository, SavingsGoalUpdate } from "./repositories/plans-repository";

export interface CreateBudgetInput {
  scope: BudgetScope;
  categoryId: string | null;
  amountMinor: bigint;
  startsOn: Date;
  endsOn: Date | null;
  agentActionId?: string | null;
}

export interface UpdateBudgetInput {
  scope?: BudgetScope;
  categoryId?: string | null;
  amountMinor?: bigint;
  status?: BudgetStatus;
  startsOn?: Date;
  endsOn?: Date | null;
}

export interface CreateSavingsGoalInput {
  name: string;
  targetAmountMinor: bigint;
  targetDate: Date | null;
  currentSavedMinor?: bigint;
  agentActionId?: string | null;
}

export interface UpdateSavingsGoalInput {
  name?: string;
  targetAmountMinor?: bigint;
  currentSavedMinor?: bigint;
  targetDate?: Date | null;
  status?: SavingsGoalStatus;
}

export interface PlansContext {
  readonly workspaceId: string;
  readonly currency: string;
  readonly locale: string;
  readonly timezone: string;
  readonly categories: readonly Pick<LedgerCategoryRecord, "id" | "name" | "kind">[];
  readonly budgets: readonly BudgetRecord[];
  readonly savingsGoals: readonly SavingsGoalRecord[];
}

/**
 * M5 plan ownership and mutation boundary. This service has no ledger writes:
 * budgets read posted transactions and savings progress is explicit state.
 */
export class PlansService {
  constructor(
    private readonly plans: PlansRepository,
    private readonly ledger: Pick<LedgerRepository, "findCategory" | "listCategories" | "listTransactions">,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  ) {}

  async getContext(actor: AuthenticatedActor, workspaceId: string): Promise<PlansContext> {
    const context = await this.requireManageContext(actor, workspaceId);
    const [categories, budgets, savingsGoals] = await Promise.all([
      this.ledger.listCategories(workspaceId),
      this.plans.listBudgets(workspaceId),
      this.plans.listSavingsGoals(workspaceId),
    ]);
    return {
      workspaceId,
      currency: context.preferences.currency,
      locale: context.preferences.locale,
      timezone: context.preferences.timezone,
      categories: categories.map(({ id, name, kind }) => ({ id, name, kind })),
      budgets,
      savingsGoals,
    };
  }

  async createBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateBudgetInput,
  ): Promise<BudgetRecord> {
    const context = await this.requireManageContext(actor, workspaceId);
    await this.assertBudgetInput(workspaceId, input);
    return this.plans.createBudget({
      id: randomUUID(),
      workspaceId,
      scope: input.scope,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      currency: context.preferences.currency,
      frequency: "MONTHLY",
      status: "ACTIVE",
      startsOn: new Date(input.startsOn),
      endsOn: input.endsOn ? new Date(input.endsOn) : null,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdByAgentActionId: input.agentActionId ?? null,
    });
  }

  async updateBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    input: UpdateBudgetInput,
  ): Promise<BudgetRecord> {
    await this.requireManageContext(actor, workspaceId);
    const existing = await this.plans.findBudget(workspaceId, budgetId);
    if (!existing) throw new NotFoundError("Budget not found in this workspace.");
    const merged: CreateBudgetInput = {
      scope: input.scope ?? existing.scope,
      categoryId: input.scope === "OVERALL" ? null : input.categoryId ?? existing.categoryId,
      amountMinor: input.amountMinor ?? existing.amountMinor,
      startsOn: input.startsOn ?? existing.startsOn,
      endsOn: input.endsOn === undefined ? existing.endsOn : input.endsOn,
    };
    await this.assertBudgetInput(workspaceId, merged);
    const update: BudgetUpdate = {
      scope: merged.scope,
      categoryId: merged.categoryId,
      amountMinor: merged.amountMinor,
      startsOn: merged.startsOn,
      endsOn: merged.endsOn,
      updatedByUserId: actor.userId,
      ...(input.status === undefined ? {} : { status: input.status }),
    };
    const updated = await this.plans.updateBudget(workspaceId, budgetId, update);
    if (!updated) throw new ConflictError("Budget changed before it could be updated.");
    return updated;
  }

  async createSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateSavingsGoalInput,
  ): Promise<SavingsGoalRecord> {
    const context = await this.requireManageContext(actor, workspaceId);
    const targetAmountMinor = assertPositiveAmount(input.targetAmountMinor, "Savings-goal target");
    const currentSavedMinor = assertNonNegativeAmount(input.currentSavedMinor ?? 0n, "Current saved amount");
    const name = cleanGoalName(input.name);
    const status: SavingsGoalStatus = currentSavedMinor >= targetAmountMinor ? "COMPLETED" : "ACTIVE";
    return this.plans.createSavingsGoal({
      id: randomUUID(),
      workspaceId,
      name,
      targetAmountMinor,
      currentSavedMinor,
      currency: context.preferences.currency,
      targetDate: input.targetDate ? assertValidDate(input.targetDate, "Target date") : null,
      status,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdByAgentActionId: input.agentActionId ?? null,
    });
  }

  async updateSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: UpdateSavingsGoalInput,
  ): Promise<SavingsGoalRecord> {
    await this.requireManageContext(actor, workspaceId);
    const existing = await this.plans.findSavingsGoal(workspaceId, goalId);
    if (!existing) throw new NotFoundError("Savings goal not found in this workspace.");
    const targetAmountMinor = assertPositiveAmount(
      input.targetAmountMinor ?? existing.targetAmountMinor,
      "Savings-goal target",
    );
    const currentSavedMinor = assertNonNegativeAmount(
      input.currentSavedMinor ?? existing.currentSavedMinor,
      "Current saved amount",
    );
    const name = input.name === undefined ? existing.name : cleanGoalName(input.name);
    const targetDate = input.targetDate === undefined ? existing.targetDate : input.targetDate;
    const status = resolveGoalStatus(existing.status, input.status, currentSavedMinor, targetAmountMinor);
    const update: SavingsGoalUpdate = {
      name,
      targetAmountMinor,
      currentSavedMinor,
      targetDate: targetDate ? assertValidDate(targetDate, "Target date") : null,
      status,
      updatedByUserId: actor.userId,
    };
    const updated = await this.plans.updateSavingsGoal(workspaceId, goalId, update);
    if (!updated) throw new ConflictError("Savings goal changed before it could be updated.");
    return updated;
  }

  async findBudgetCreatedByAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    agentActionId: string,
  ): Promise<BudgetRecord | null> {
    await this.requireManageContext(actor, workspaceId);
    return this.plans.findBudgetByAgentAction(workspaceId, agentActionId);
  }

  async findSavingsGoalCreatedByAction(
    actor: AuthenticatedActor,
    workspaceId: string,
    agentActionId: string,
  ): Promise<SavingsGoalRecord | null> {
    await this.requireManageContext(actor, workspaceId);
    return this.plans.findSavingsGoalByAgentAction(workspaceId, agentActionId);
  }

  async listBudgetSummaries(
    actor: AuthenticatedActor,
    workspaceId: string,
    now = new Date(),
  ): Promise<BudgetSummary[]> {
    const context = await this.requireReadContext(actor, workspaceId);
    const [records, transactions] = await Promise.all([
      this.plans.listBudgets(workspaceId),
      this.ledger.listTransactions(workspaceId, { statuses: ["POSTED"] }),
    ]);
    return records.map((budget) => summarizeBudget(budget, transactions, context.preferences.timezone, now));
  }

  async listSavingsGoalSummaries(
    actor: AuthenticatedActor,
    workspaceId: string,
    now = new Date(),
  ): Promise<SavingsGoalSummary[]> {
    const context = await this.requireReadContext(actor, workspaceId);
    const goals = await this.plans.listSavingsGoals(workspaceId);
    return goals.map((goal) => summarizeSavingsGoal(goal, context.preferences.timezone, now));
  }

  private async assertBudgetInput(workspaceId: string, input: CreateBudgetInput): Promise<void> {
    assertPositiveAmount(input.amountMinor, "Budget amount");
    const startsOn = assertValidDate(input.startsOn, "Budget start");
    const endsOn = input.endsOn ? assertValidDate(input.endsOn, "Budget end") : null;
    if (endsOn && endsOn < startsOn) throw new ConflictError("Budget end must not precede its start.");
    if (input.scope === "OVERALL") {
      if (input.categoryId !== null) throw new ConflictError("An overall budget cannot select a category.");
      return;
    }
    if (!input.categoryId) throw new ConflictError("A category budget needs an expense category.");
    const category = await this.ledger.findCategory(workspaceId, input.categoryId);
    if (!category || category.kind !== "EXPENSE") {
      throw new NotFoundError("Budget category not found in this workspace.");
    }
  }

  private async requireReadContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(workspaceId, actor.userId);
    if (!context) throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "read");
    return context;
  }

  private async requireManageContext(actor: AuthenticatedActor, workspaceId: string): Promise<WorkspaceMemberContext> {
    const context = await this.requireReadContext(actor, workspaceId);
    assertWorkspacePermission(context.membership.role, "manage_ledger");
    return context;
  }
}

export function summarizeBudget(
  budget: BudgetRecord,
  transactions: readonly LedgerTransactionRecord[],
  timeZone: string,
  now = new Date(),
): BudgetSummary {
  const monthly = monthPeriod(now, timeZone);
  const effectiveStart = budget.startsOn > monthly.start ? budget.startsOn : monthly.start;
  const effectiveEnd = budget.endsOn && budget.endsOn < monthly.end ? budget.endsOn : monthly.end;
  const activeForPeriod =
    budget.status === "ACTIVE" &&
    budget.startsOn < monthly.end &&
    (!budget.endsOn || budget.endsOn > monthly.start) &&
    effectiveStart < effectiveEnd;
  if (!activeForPeriod) {
    return emptyBudgetSummary(budget, monthly.start, monthly.end);
  }
  const period = { start: effectiveStart, end: effectiveEnd };
  const financialTransactions = transactions.filter(isUserFacingLedgerTransaction);
  const summary = summarizePeriod(financialTransactions, period, {
    currency: budget.currency,
    statuses: ["POSTED"],
  });
  const spend =
    budget.scope === "OVERALL"
      ? summary.totals.spending.minor
      : summary.categories.find((entry) => entry.id === budget.categoryId)?.spending.minor ?? 0n;
  const dailyPace = calculateDailyPace(financialTransactions, period, timeZone, {
    currency: budget.currency,
    statuses: ["POSTED"],
    now,
  });
  return {
    budget,
    periodStart: effectiveStart,
    periodEnd: effectiveEnd,
    currentSpendMinor: spend,
    remainingMinor: budget.amountMinor - spend,
    percentageUsedBps: (spend * 10_000n) / budget.amountMinor,
    expectedUsageBps: (BigInt(dailyPace.elapsedDayCount) * 10_000n) / BigInt(dailyPace.totalDayCount),
    overBudget: spend > budget.amountMinor,
    activeForPeriod: true,
  };
}

export function summarizeSavingsGoal(
  goal: SavingsGoalRecord,
  timeZone: string,
  now = new Date(),
): SavingsGoalSummary {
  const remainingMinor = goal.targetAmountMinor > goal.currentSavedMinor
    ? goal.targetAmountMinor - goal.currentSavedMinor
    : 0n;
  return {
    goal,
    remainingMinor,
    progressBps: (goal.currentSavedMinor * 10_000n) / goal.targetAmountMinor,
    requiredDailyMinor: goal.targetDate && remainingMinor > 0n
      ? divideCeiling(remainingMinor, calendarDaysUntil(goal.targetDate, timeZone, now))
      : null,
    completed: goal.status === "COMPLETED" || goal.currentSavedMinor >= goal.targetAmountMinor,
  };
}

function emptyBudgetSummary(budget: BudgetRecord, periodStart: Date, periodEnd: Date): BudgetSummary {
  return {
    budget,
    periodStart,
    periodEnd,
    currentSpendMinor: 0n,
    remainingMinor: budget.amountMinor,
    percentageUsedBps: 0n,
    expectedUsageBps: 0n,
    overBudget: false,
    activeForPeriod: false,
  };
}

function monthPeriod(now: Date, timeZone: string): { start: Date; end: Date } {
  const local = localDateForInstant(now, timeZone);
  const start = `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(local.year, local.month, 1));
  const end = `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-01`;
  return periodForLocalDates(start, end, timeZone);
}

function calendarDaysUntil(targetDate: Date, timeZone: string, now: Date): bigint {
  const today = localDateForInstant(now, timeZone);
  const target = localDateForInstant(targetDate, timeZone);
  const todayAtUtc = Date.parse(`${localDateKey(today)}T00:00:00.000Z`);
  const targetAtUtc = Date.parse(`${localDateKey(target)}T00:00:00.000Z`);
  const days = Math.floor((targetAtUtc - todayAtUtc) / 86_400_000) + 1;
  return BigInt(Math.max(1, days));
}

function divideCeiling(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

function assertPositiveAmount(value: bigint, field: string): bigint {
  if (value <= 0n) throw new ConflictError(`${field} must be positive.`);
  return value;
}

function assertNonNegativeAmount(value: bigint, field: string): bigint {
  if (value < 0n) throw new ConflictError(`${field} cannot be negative.`);
  return value;
}

function assertValidDate(value: Date, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ConflictError(`${field} must be a valid date.`);
  return date;
}

function cleanGoalName(value: string): string {
  const name = value.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (!name || name.length > 160) throw new ConflictError("Savings-goal name is invalid.");
  return name;
}

function resolveGoalStatus(
  previous: SavingsGoalStatus,
  requested: SavingsGoalStatus | undefined,
  currentSavedMinor: bigint,
  targetAmountMinor: bigint,
): SavingsGoalStatus {
  if (requested === "ARCHIVED") return "ARCHIVED";
  if (currentSavedMinor >= targetAmountMinor) return "COMPLETED";
  if (requested === "COMPLETED") {
    throw new ConflictError("A savings goal can be completed only after its target is saved.");
  }
  if (requested) return requested;
  return previous === "COMPLETED" ? "ACTIVE" : previous;
}
