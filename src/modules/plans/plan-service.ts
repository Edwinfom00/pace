import { createHash, randomUUID } from "node:crypto";

import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { calculateDailyPace, summarizePeriod } from "@/money/engine";
import {
  localDateForInstant,
  localDateKey,
  periodForLocalDates,
} from "@/money/period";
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
import type {
  BudgetUpdate,
  CreateBudgetRecord,
  PlansRepository,
  SavingsGoalUpdate,
} from "./repositories/plans-repository";

export interface CreateBudgetInput {
  scope: BudgetScope;
  categoryId: string | null;
  subcategoryIds?: readonly string[];
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

export interface ManageBudgetInput extends UpdateBudgetInput {
  readonly subcategoryIds?: readonly string[];
  readonly expectedUpdatedAt: Date;
  readonly idempotencyKey: string;
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

export interface ManageSavingsGoalInput {
  readonly name?: string;
  readonly targetAmountMinor?: bigint;
  readonly targetDate?: Date | null;
  readonly expectedUpdatedAt: Date;
  readonly idempotencyKey: string;
}

export interface PlansContext {
  readonly workspaceId: string;
  readonly currency: string;
  readonly locale: string;
  readonly timezone: string;
  readonly categories: readonly Pick<
    LedgerCategoryRecord,
    "id" | "name" | "kind"
  >[];
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
    private readonly ledger: Pick<
      LedgerRepository,
      "findCategory" | "listCategories" | "listTransactions"
    >,
    private readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">,
  ) {}

  async getContext(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<PlansContext> {
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
    if (input.agentActionId) {
      const prior = await this.plans.findBudgetByAgentAction(
        workspaceId,
        input.agentActionId,
      );
      if (prior) return prior;
    }
    const record: CreateBudgetRecord = {
      id: randomUUID(),
      workspaceId,
      scope: input.scope,
      categoryId: input.categoryId,
      subcategoryIds: input.subcategoryIds ?? [],
      amountMinor: input.amountMinor,
      currency: context.preferences.currency,
      frequency: "MONTHLY",
      status: "ACTIVE",
      startsOn: new Date(input.startsOn),
      endsOn: input.endsOn ? new Date(input.endsOn) : null,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdByAgentActionId: input.agentActionId ?? null,
    };
    try {
      return await this.plans.createBudget(record);
    } catch (error) {
      if (input.agentActionId) {
        const prior = await this.plans.findBudgetByAgentAction(
          workspaceId,
          input.agentActionId,
        );
        if (prior) return prior;
      }
      throw error;
    }
  }

  async updateBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    input: UpdateBudgetInput,
  ): Promise<BudgetRecord> {
    await this.requireManageContext(actor, workspaceId);
    const existing = await this.plans.findBudget(workspaceId, budgetId);
    if (!existing)
      throw new NotFoundError("Budget not found in this workspace.");
    const merged: CreateBudgetInput = {
      scope: input.scope ?? existing.scope,
      categoryId:
        input.scope === "OVERALL"
          ? null
          : (input.categoryId ?? existing.categoryId),
      subcategoryIds:
        input.scope === "OVERALL" ? [] : (existing.subcategoryIds ?? []),
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
    const updated = await this.plans.updateBudget(
      workspaceId,
      budgetId,
      update,
    );
    if (!updated)
      throw new ConflictError("Budget changed before it could be updated.");
    return updated;
  }

  /** Canonical M11 budget edit. It changes planning configuration only. */
  async editBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    input: ManageBudgetInput,
  ): Promise<BudgetRecord> {
    return this.manageBudget(actor, workspaceId, budgetId, input, "EDIT");
  }

  /** Archives the budget record; it never deletes or alters ledger history. */
  async archiveBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    input: Pick<ManageBudgetInput, "expectedUpdatedAt" | "idempotencyKey">,
  ): Promise<BudgetRecord> {
    return this.manageBudget(actor, workspaceId, budgetId, input, "ARCHIVE");
  }

  private async manageBudget(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    input: Partial<ManageBudgetInput>,
    action: "EDIT" | "ARCHIVE",
  ): Promise<BudgetRecord> {
    await this.requireManageContext(actor, workspaceId);
    if (
      !input.expectedUpdatedAt ||
      !Number.isFinite(input.expectedUpdatedAt.getTime())
    )
      throw new ConflictError("An expected budget version is required.");
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 180)
      throw new ConflictError("An idempotency key is required.");
    const existing = await this.plans.findBudget(workspaceId, budgetId);
    if (!existing)
      throw new NotFoundError("Budget not found in this workspace.");
    const fingerprint = budgetCommandFingerprint(action, budgetId, input);
    const replay = await this.plans.findBudgetManagementAudit(
      workspaceId,
      actor.userId,
      idempotencyKey,
    );
    if (replay) {
      if (replay.commandFingerprint !== fingerprint)
        throw new ConflictError(
          "This idempotency key was already used for another budget action.",
        );
      const prior = await this.plans.findBudget(workspaceId, replay.budgetId);
      if (prior) return prior;
      throw new ConflictError("Budget action replay could not be resolved.");
    }
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new ConflictError("Budget changed before it could be updated.");
    if (action === "ARCHIVE" && existing.status === "ARCHIVED") return existing;
    if (action === "EDIT" && existing.status !== "ACTIVE")
      throw new ConflictError("Archived budgets cannot be edited.");
    if (action === "EDIT" && existing.startsOn < currentMonthStart())
      throw new ConflictError(
        "Only budgets that have not started can be edited; create a new budget for a future period.",
      );
    const merged: CreateBudgetInput = {
      scope: input.scope ?? existing.scope,
      categoryId:
        input.scope === "OVERALL"
          ? null
          : (input.categoryId ?? existing.categoryId),
      subcategoryIds:
        input.scope === "OVERALL"
          ? []
          : (input.subcategoryIds ?? existing.subcategoryIds),
      amountMinor: input.amountMinor ?? existing.amountMinor,
      startsOn: input.startsOn ?? existing.startsOn,
      endsOn: input.endsOn === undefined ? existing.endsOn : input.endsOn,
    };
    await this.assertBudgetInput(workspaceId, merged);
    const updated = await this.plans.updateBudget(
      workspaceId,
      budgetId,
      {
        ...merged,
        updatedByUserId: actor.userId,
        ...(action === "ARCHIVE" ? { status: "ARCHIVED" as const } : {}),
      },
      input.expectedUpdatedAt,
    );
    if (!updated)
      throw new ConflictError("Budget changed before it could be updated.");
    await this.plans.createBudgetManagementAudit({
      id: randomUUID(),
      workspaceId,
      budgetId,
      actorUserId: actor.userId,
      action,
      commandFingerprint: fingerprint,
      idempotencyKey,
    });
    return updated;
  }

  async createSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    input: CreateSavingsGoalInput,
  ): Promise<SavingsGoalRecord> {
    const context = await this.requireManageContext(actor, workspaceId);
    if (input.agentActionId) {
      const prior = await this.plans.findSavingsGoalByAgentAction(
        workspaceId,
        input.agentActionId,
      );
      if (prior) return prior;
    }
    const targetAmountMinor = assertPositiveAmount(
      input.targetAmountMinor,
      "Savings-goal target",
    );
    const currentSavedMinor = assertNonNegativeAmount(
      input.currentSavedMinor ?? 0n,
      "Current saved amount",
    );
    const name = cleanGoalName(input.name);
    const status: SavingsGoalStatus =
      currentSavedMinor >= targetAmountMinor ? "COMPLETED" : "ACTIVE";
    const record = {
      id: randomUUID(),
      workspaceId,
      name,
      targetAmountMinor,
      currentSavedMinor,
      currency: context.preferences.currency,
      targetDate: input.targetDate
        ? assertValidDate(input.targetDate, "Target date")
        : null,
      status,
      createdByUserId: actor.userId,
      updatedByUserId: actor.userId,
      createdByAgentActionId: input.agentActionId ?? null,
    };
    try {
      return await this.plans.createSavingsGoal(record);
    } catch (error) {
      if (input.agentActionId) {
        const prior = await this.plans.findSavingsGoalByAgentAction(
          workspaceId,
          input.agentActionId,
        );
        if (prior) return prior;
      }
      throw error;
    }
  }

  async updateSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: UpdateSavingsGoalInput,
  ): Promise<SavingsGoalRecord> {
    await this.requireManageContext(actor, workspaceId);
    const existing = await this.plans.findSavingsGoal(workspaceId, goalId);
    if (!existing)
      throw new NotFoundError("Savings goal not found in this workspace.");
    const targetAmountMinor = assertPositiveAmount(
      input.targetAmountMinor ?? existing.targetAmountMinor,
      "Savings-goal target",
    );
    const currentSavedMinor = assertNonNegativeAmount(
      input.currentSavedMinor ?? existing.currentSavedMinor,
      "Current saved amount",
    );
    const name =
      input.name === undefined ? existing.name : cleanGoalName(input.name);
    const targetDate =
      input.targetDate === undefined ? existing.targetDate : input.targetDate;
    const status = resolveGoalStatus(
      existing.status,
      input.status,
      currentSavedMinor,
      targetAmountMinor,
    );
    const update: SavingsGoalUpdate = {
      name,
      targetAmountMinor,
      currentSavedMinor,
      targetDate: targetDate
        ? assertValidDate(targetDate, "Target date")
        : null,
      status,
      updatedByUserId: actor.userId,
    };
    const updated = await this.plans.updateSavingsGoal(
      workspaceId,
      goalId,
      update,
    );
    if (!updated)
      throw new ConflictError(
        "Savings goal changed before it could be updated.",
      );
    return updated;
  }

  /** Canonical M11.5C edit. It changes future goal planning only. */
  async editSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: ManageSavingsGoalInput,
  ): Promise<SavingsGoalRecord> {
    return this.manageSavingsGoal(actor, workspaceId, goalId, input, "EDIT");
  }

  /** Archives the goal record; it never deletes or alters explicit progress. */
  async archiveSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: Pick<ManageSavingsGoalInput, "expectedUpdatedAt" | "idempotencyKey">,
  ): Promise<SavingsGoalRecord> {
    return this.manageSavingsGoal(actor, workspaceId, goalId, input, "ARCHIVE");
  }

  /** M5 permits completion only when the explicitly recorded progress reaches target. */
  async completeSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: Pick<ManageSavingsGoalInput, "expectedUpdatedAt" | "idempotencyKey">,
  ): Promise<SavingsGoalRecord> {
    return this.manageSavingsGoal(
      actor,
      workspaceId,
      goalId,
      input,
      "COMPLETE",
    );
  }

  private async manageSavingsGoal(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    input: Partial<ManageSavingsGoalInput>,
    action: "EDIT" | "ARCHIVE" | "COMPLETE",
  ): Promise<SavingsGoalRecord> {
    await this.requireManageContext(actor, workspaceId);
    if (
      !input.expectedUpdatedAt ||
      !Number.isFinite(input.expectedUpdatedAt.getTime())
    )
      throw new ConflictError("An expected savings-goal version is required.");
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 180)
      throw new ConflictError("An idempotency key is required.");
    const existing = await this.plans.findSavingsGoal(workspaceId, goalId);
    if (!existing)
      throw new NotFoundError("Savings goal not found in this workspace.");
    const fingerprint = savingsGoalCommandFingerprint(action, goalId, input);
    const replay = await this.plans.findSavingsGoalManagementAudit(
      workspaceId,
      actor.userId,
      idempotencyKey,
    );
    if (replay) {
      if (replay.commandFingerprint !== fingerprint)
        throw new ConflictError(
          "This idempotency key was already used for another savings-goal action.",
        );
      const prior = await this.plans.findSavingsGoal(
        workspaceId,
        replay.goalId,
      );
      if (prior) return prior;
      throw new ConflictError(
        "Savings-goal action replay could not be resolved.",
      );
    }
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new ConflictError(
        "Savings goal changed before it could be updated.",
      );
    if (action === "ARCHIVE" && existing.status === "ARCHIVED") return existing;
    if (action !== "ARCHIVE" && existing.status === "ARCHIVED")
      throw new ConflictError("Archived savings goals cannot be changed.");
    if (
      action === "COMPLETE" &&
      existing.currentSavedMinor < existing.targetAmountMinor
    )
      throw new ConflictError(
        "A savings goal can be completed only after its target is saved.",
      );

    const targetAmountMinor = assertPositiveAmount(
      input.targetAmountMinor ?? existing.targetAmountMinor,
      "Savings-goal target",
    );
    const targetDate =
      input.targetDate === undefined ? existing.targetDate : input.targetDate;
    const update: SavingsGoalUpdate = {
      ...(action === "EDIT"
        ? {
            name:
              input.name === undefined
                ? existing.name
                : cleanGoalName(input.name),
            targetAmountMinor,
            targetDate: targetDate
              ? assertValidDate(targetDate, "Target date")
              : null,
            status: resolveGoalStatus(
              existing.status,
              undefined,
              existing.currentSavedMinor,
              targetAmountMinor,
            ),
          }
        : {}),
      ...(action === "ARCHIVE" ? { status: "ARCHIVED" as const } : {}),
      ...(action === "COMPLETE" ? { status: "COMPLETED" as const } : {}),
      updatedByUserId: actor.userId,
    };
    const updated = await this.plans.updateSavingsGoal(
      workspaceId,
      goalId,
      update,
      input.expectedUpdatedAt,
    );
    if (!updated)
      throw new ConflictError(
        "Savings goal changed before it could be updated.",
      );
    await this.plans.createSavingsGoalManagementAudit({
      id: randomUUID(),
      workspaceId,
      goalId,
      actorUserId: actor.userId,
      action,
      commandFingerprint: fingerprint,
      idempotencyKey,
    });
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
    const [records, transactions, categories] = await Promise.all([
      this.plans.listBudgets(workspaceId),
      this.ledger.listTransactions(workspaceId, { statuses: ["POSTED"] }),
      this.ledger.listCategories(workspaceId),
    ]);
    return records.map((budget) =>
      summarizeBudget(
        budget,
        transactions,
        context.preferences.timezone,
        now,
        categories,
      ),
    );
  }

  async getBudgetSummary(
    actor: AuthenticatedActor,
    workspaceId: string,
    budgetId: string,
    now = new Date(),
  ): Promise<BudgetSummary | null> {
    const context = await this.requireReadContext(actor, workspaceId);
    const [budget, transactions, categories] = await Promise.all([
      this.plans.findBudget(workspaceId, budgetId),
      this.ledger.listTransactions(workspaceId, { statuses: ["POSTED"] }),
      this.ledger.listCategories(workspaceId),
    ]);
    return budget
      ? summarizeBudget(
          budget,
          transactions,
          context.preferences.timezone,
          now,
          categories,
        )
      : null;
  }

  async listSavingsGoalSummaries(
    actor: AuthenticatedActor,
    workspaceId: string,
    now = new Date(),
  ): Promise<SavingsGoalSummary[]> {
    const context = await this.requireReadContext(actor, workspaceId);
    const goals = await this.plans.listSavingsGoals(workspaceId);
    return goals.map((goal) =>
      summarizeSavingsGoal(goal, context.preferences.timezone, now),
    );
  }

  async getSavingsGoalSummary(
    actor: AuthenticatedActor,
    workspaceId: string,
    goalId: string,
    now = new Date(),
  ): Promise<SavingsGoalSummary | null> {
    const context = await this.requireReadContext(actor, workspaceId);
    const goal = await this.plans.findSavingsGoal(workspaceId, goalId);
    return goal
      ? summarizeSavingsGoal(goal, context.preferences.timezone, now)
      : null;
  }

  private async assertBudgetInput(
    workspaceId: string,
    input: CreateBudgetInput,
  ): Promise<void> {
    assertPositiveAmount(input.amountMinor, "Budget amount");
    const startsOn = assertValidDate(input.startsOn, "Budget start");
    const endsOn = input.endsOn
      ? assertValidDate(input.endsOn, "Budget end")
      : null;
    if (endsOn && endsOn < startsOn)
      throw new ConflictError("Budget end must not precede its start.");
    if (input.scope === "OVERALL") {
      if (input.categoryId !== null)
        throw new ConflictError("An overall budget cannot select a category.");
      return;
    }
    if (!input.categoryId)
      throw new ConflictError("A category budget needs an expense category.");
    const category = await this.ledger.findCategory(
      workspaceId,
      input.categoryId,
    );
    if (!category || category.kind !== "EXPENSE") {
      throw new NotFoundError("Budget category not found in this workspace.");
    }
    const selected = [...new Set(input.subcategoryIds ?? [])];
    if (selected.length !== (input.subcategoryIds ?? []).length)
      throw new ConflictError("Budget subcategories must be unique.");
    if (!selected.length) return;
    const categories = await this.ledger.listCategories(workspaceId);
    const children = new Map(categories.map((item) => [item.id, item]));
    if (
      selected.some((id) => {
        const child = children.get(id);
        return (
          !child ||
          child.kind !== "EXPENSE" ||
          child.parentCategoryId !== input.categoryId
        );
      })
    ) {
      throw new NotFoundError("Budget subcategory not found in this category.");
    }
  }

  private async requireReadContext(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<WorkspaceMemberContext> {
    const context = await this.workspaces.findMemberContext(
      workspaceId,
      actor.userId,
    );
    if (!context)
      throw new AuthorizationError("You are not a member of this workspace.");
    assertWorkspacePermission(context.membership.role, "read");
    return context;
  }

  private async requireManageContext(
    actor: AuthenticatedActor,
    workspaceId: string,
  ): Promise<WorkspaceMemberContext> {
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
  categories: readonly LedgerCategoryRecord[] = [],
): BudgetSummary {
  const monthly = monthPeriod(now, timeZone);
  const effectiveStart =
    budget.startsOn > monthly.start ? budget.startsOn : monthly.start;
  const effectiveEnd =
    budget.endsOn && budget.endsOn < monthly.end ? budget.endsOn : monthly.end;
  const activeForPeriod =
    budget.status === "ACTIVE" &&
    budget.startsOn < monthly.end &&
    (!budget.endsOn || budget.endsOn > monthly.start) &&
    effectiveStart < effectiveEnd;
  if (!activeForPeriod) {
    return emptyBudgetSummary(budget, monthly.start, monthly.end);
  }
  const period = { start: effectiveStart, end: effectiveEnd };
  const financialTransactions = transactions.filter(
    isUserFacingLedgerTransaction,
  );
  const summary = summarizePeriod(financialTransactions, period, {
    currency: budget.currency,
    statuses: ["POSTED"],
  });
  const categoryIds = new Set<string>();
  if (budget.scope === "CATEGORY" && budget.categoryId) {
    if (budget.subcategoryIds.length)
      budget.subcategoryIds.forEach((id) => categoryIds.add(id));
    else {
      categoryIds.add(budget.categoryId);
      categories
        .filter((category) => category.parentCategoryId === budget.categoryId)
        .forEach((category) => categoryIds.add(category.id));
    }
  }
  const spend =
    budget.scope === "OVERALL"
      ? summary.totals.spending.minor
      : summary.categories.reduce(
          (total, entry) =>
            categoryIds.has(entry.id) ? total + entry.spending.minor : total,
          0n,
        );
  const dailyPace = calculateDailyPace(
    financialTransactions,
    period,
    timeZone,
    {
      currency: budget.currency,
      statuses: ["POSTED"],
      now,
    },
  );
  return {
    budget,
    periodStart: effectiveStart,
    periodEnd: effectiveEnd,
    currentSpendMinor: spend,
    remainingMinor: budget.amountMinor - spend,
    percentageUsedBps: (spend * 10_000n) / budget.amountMinor,
    expectedUsageBps:
      (BigInt(dailyPace.elapsedDayCount) * 10_000n) /
      BigInt(dailyPace.totalDayCount),
    overBudget: spend > budget.amountMinor,
    activeForPeriod: true,
    capabilities: {
      canEdit: budget.status === "ACTIVE",
      canArchive: budget.status === "ACTIVE",
      canPause: false,
      canResume: false,
    },
  };
}

export function summarizeSavingsGoal(
  goal: SavingsGoalRecord,
  timeZone: string,
  now = new Date(),
): SavingsGoalSummary {
  const remainingMinor =
    goal.targetAmountMinor > goal.currentSavedMinor
      ? goal.targetAmountMinor - goal.currentSavedMinor
      : 0n;
  const targetDateDaysRemaining = goal.targetDate
    ? calendarDaysUntil(goal.targetDate, timeZone, now)
    : null;
  return {
    goal,
    remainingMinor,
    progressBps: (goal.currentSavedMinor * 10_000n) / goal.targetAmountMinor,
    requiredDailyMinor:
      goal.targetDate && remainingMinor > 0n
        ? divideCeiling(remainingMinor, targetDateDaysRemaining!)
        : null,
    targetDateDaysRemaining,
    completed:
      goal.status === "COMPLETED" ||
      goal.currentSavedMinor >= goal.targetAmountMinor,
    capabilities: {
      canEdit: goal.status !== "ARCHIVED",
      canArchive: goal.status !== "ARCHIVED",
      canComplete:
        goal.status !== "ARCHIVED" &&
        goal.status !== "COMPLETED" &&
        goal.currentSavedMinor >= goal.targetAmountMinor,
      // M5 has no manual reopen transition. Raising a completed goal's target
      // through EDIT resumes it under the canonical status resolution rule.
      canReopen: false,
    },
  };
}

function emptyBudgetSummary(
  budget: BudgetRecord,
  periodStart: Date,
  periodEnd: Date,
): BudgetSummary {
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
    capabilities: {
      canEdit: budget.status === "ACTIVE",
      canArchive: budget.status === "ACTIVE",
      canPause: false,
      canResume: false,
    },
  };
}

function budgetCommandFingerprint(
  action: "EDIT" | "ARCHIVE",
  budgetId: string,
  input: Partial<ManageBudgetInput>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action,
        budgetId,
        scope: input.scope ?? null,
        categoryId: input.categoryId ?? null,
        subcategoryIds: input.subcategoryIds ?? null,
        amountMinor: input.amountMinor?.toString() ?? null,
        startsOn: input.startsOn?.toISOString() ?? null,
        endsOn:
          input.endsOn === undefined
            ? null
            : (input.endsOn?.toISOString() ?? null),
        expectedUpdatedAt: input.expectedUpdatedAt?.toISOString() ?? null,
      }),
    )
    .digest("hex");
}

function savingsGoalCommandFingerprint(
  action: "EDIT" | "ARCHIVE" | "COMPLETE",
  goalId: string,
  input: Partial<ManageSavingsGoalInput>,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        action,
        goalId,
        name: input.name ?? null,
        targetAmountMinor: input.targetAmountMinor?.toString() ?? null,
        targetDate:
          input.targetDate === undefined
            ? null
            : (input.targetDate?.toISOString() ?? null),
        expectedUpdatedAt: input.expectedUpdatedAt?.toISOString() ?? null,
      }),
    )
    .digest("hex");
}

function monthPeriod(now: Date, timeZone: string): { start: Date; end: Date } {
  const local = localDateForInstant(now, timeZone);
  const start = `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(local.year, local.month, 1));
  const end = `${next.getUTCFullYear().toString().padStart(4, "0")}-${(
    next.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-01`;
  return periodForLocalDates(start, end, timeZone);
}

function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function calendarDaysUntil(
  targetDate: Date,
  timeZone: string,
  now: Date,
): bigint {
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
  if (!Number.isFinite(date.getTime()))
    throw new ConflictError(`${field} must be a valid date.`);
  return date;
}

function cleanGoalName(value: string): string {
  const name = value.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  if (!name || name.length > 160)
    throw new ConflictError("Savings-goal name is invalid.");
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
    throw new ConflictError(
      "A savings goal can be completed only after its target is saved.",
    );
  }
  if (requested) return requested;
  return previous === "COMPLETED" ? "ACTIVE" : previous;
}
