import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  assertWorkspacePermission,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import { resolveAccountReference } from "@/modules/accounts/domain/account-reference";
import type {
  CurrencyForecast,
  ForecastAmount,
  ForecastEvent,
} from "@/modules/forecast/domain/forecast";
import {
  getWorkspaceForecastWithReaders,
  type WorkspaceForecastReaders,
} from "@/modules/forecast/queries/get-workspace-forecast";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { UNCATEGORIZED_CATEGORY_ID } from "@/money/engine";
import { CurrencyMismatchError } from "@/money/money";

import {
  agentMoney,
  localDay,
  presentAgentBudget,
  presentAgentContributions,
  presentAgentGoal,
  presentAgentRule,
  resolveBudgetReference,
  resolveGoalReference,
  resolveRuleReference,
  type AgentBudgetFilter,
  type AgentBudgetView,
  type AgentForecastQuery,
  type AgentGoalFilter,
  type AgentPlanListQuery,
  type AgentRuleListQuery,
  type BudgetReference,
  type GoalReference,
  type PlanReferenceResolution,
  type RuleReference,
} from "../agent-plans-view";
import type { PlansService } from "../plan-service";
import {
  getRulesOverviewWithReaders,
  type RulesOverviewReaders,
} from "../rules/queries/get-rules-overview";

export type AgentPlansReadDependencies = {
  readonly plans: Pick<
    PlansService,
    | "listBudgetSummaries"
    | "getBudgetCategorySpend"
    | "listSavingsGoalSummaries"
    | "listSavingsGoalContributions"
  >;
  readonly rules: RulesOverviewReaders;
  readonly forecast: WorkspaceForecastReaders;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};

type ReadScope = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly now?: Date;
};
type Reader = {
  readonly role: WorkspaceRole;
  readonly currency: string;
  readonly timezone: string;
};

const BUDGET_SEMANTICS =
  "Spending is computed by the server from effective posted Transactions in the budget's currency. Transfers are excluded and refunds reduce it.";
const GOAL_SEMANTICS =
  "Saved progress is the sum of recorded contributions. A contribution is planning progress only: it is not a Transaction, it moves no money, and it changes no account balance.";
const FORECAST_SEMANTICS =
  "Current balances are actual ledger balances. Everything after today is a projection from confirmed, active recurring items only. It is an estimate, not a guarantee: nothing projected has been posted and no balance has changed.";
const RULE_SEMANTICS =
  "Rules run when a transaction is created, in priority order with the lowest number first. Every condition must match. For each action type only the first matching rule applies; later ones are shadowed. A rule can only assign a category or send a transaction to the Inbox for review; it never moves money or changes an amount or balance.";

export async function listAgentBudgets(
  input: ReadScope & { readonly query: AgentPlanListQuery<AgentBudgetFilter> },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const budgets = await readBudgets(input, reader, dependencies);
  const matching =
    input.query.filter === "ALL"
      ? budgets
      : budgets.filter((budget) => budget.status === input.query.filter);
  const listed = matching.slice(0, input.query.limit);
  return {
    filter: input.query.filter,
    semantics: BUDGET_SEMANTICS,
    counts: {
      all: budgets.length,
      active: budgets.filter((budget) => budget.status === "ACTIVE").length,
      archived: budgets.filter((budget) => budget.status === "ARCHIVED").length,
    },
    currencies: [...new Set(budgets.map((budget) => budget.amount.currency))],
    matchingCount: matching.length,
    listedCount: listed.length,
    budgets: listed,
  };
}

export async function getAgentBudget(
  input: ReadScope & { readonly reference: BudgetReference },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const located = requireKnownId(
    input.reference.budgetId,
    resolveBudgetReference(
      input.reference,
      await readBudgets(input, reader, dependencies),
      {
        preferTrackedThisMonth: true,
      },
    ),
    "Budget not found in this workspace.",
  );
  if (located.status !== "RESOLVED") return unresolved(located);

  const [breakdown, categories] = await Promise.all([
    safeBudgetRead(() =>
      dependencies.plans.getBudgetCategorySpend(
        input.actor,
        input.workspaceId,
        located.item.id,
        input.now,
      ),
    ),
    dependencies.rules.listCategories(input.actor, input.workspaceId),
  ]);
  if (!breakdown)
    throw new NotFoundError("Budget not found in this workspace.");
  const names = new Map(categories.map((category) => [category.id, category]));
  const currency = breakdown.summary.budget.currency;

  return {
    resolved: true as const,
    semantics: BUDGET_SEMANTICS,
    budget: located.item,
    scopeMeaning: scopeMeaning(located.item),
    contributingCategories: breakdown.categories
      .map((entry) => {
        const category = names.get(entry.categoryId);
        const parent = category?.parentCategoryId
          ? names.get(category.parentCategoryId)
          : null;
        return {
          categoryId:
            entry.categoryId === UNCATEGORIZED_CATEGORY_ID
              ? null
              : entry.categoryId,
          name:
            category?.name ??
            (entry.categoryId === UNCATEGORIZED_CATEGORY_ID
              ? "Uncategorized"
              : "Unknown category"),
          parentName: parent?.name ?? null,
          spent: agentMoney(entry.spendMinor, currency),
        };
      })
      .sort((left, right) => {
        const difference =
          BigInt(right.spent.minorUnits) - BigInt(left.spent.minorUnits);
        return difference > 0n
          ? 1
          : difference < 0n
            ? -1
            : left.name.localeCompare(right.name);
      }),
  };
}

export async function listAgentGoals(
  input: ReadScope & { readonly query: AgentPlanListQuery<AgentGoalFilter> },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const goals = await readGoals(input, reader, dependencies);
  const matching =
    input.query.filter === "ALL"
      ? goals
      : goals.filter((goal) => goal.status === input.query.filter);
  const listed = matching.slice(0, input.query.limit);
  return {
    filter: input.query.filter,
    semantics: GOAL_SEMANTICS,
    matchingCount: matching.length,
    listedCount: listed.length,
    goals: listed,
  };
}

export async function getAgentGoal(
  input: ReadScope & { readonly reference: GoalReference },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const located = requireKnownId(
    input.reference.goalId,
    resolveGoalReference(
      input.reference,
      await readGoals(input, reader, dependencies),
    ),
    "Savings goal not found in this workspace.",
  );
  if (located.status !== "RESOLVED") return unresolved(located);

  const goal = located.item;
  const contributions = presentAgentContributions(
    await dependencies.plans.listSavingsGoalContributions(
      input.actor,
      input.workspaceId,
      goal.id,
    ),
    goal.allowedActions.canContribute,
    reader.timezone,
  );
  return {
    resolved: true as const,
    semantics: GOAL_SEMANTICS,
    goal,
    reopenNote:
      "A completed goal has no manual reopen. Raising its target above the saved amount returns it to active.",
    contributions: {
      historyIsAppendOnly: true as const,
      affectsAccountBalances: false as const,
      count: contributions.length,
      entries: contributions,
    },
  };
}

/** Projects balances from the canonical forecast read. It never posts a Transaction or changes a balance. */
export async function getAgentForecast(
  input: ReadScope & { readonly query: AgentForecastQuery },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  let accountId: string | undefined;
  if (input.query.accountName) {
    const accounts = (
      await dependencies.forecast.listAccounts(input.actor, input.workspaceId)
    ).filter((account) => !account.archivedAt);
    const account = resolveAccountReference(
      { accountName: input.query.accountName },
      accounts,
    );
    if (account.status !== "RESOLVED") {
      return {
        resolved: false as const,
        reason: account.status,
        candidates: account.candidates.map(({ id, name, currency }) => ({
          id,
          name,
          currency,
        })),
      };
    }
    accountId = account.account.id;
  }

  const forecast = await getWorkspaceForecastWithReaders(
    {
      actor: input.actor,
      workspaceId: input.workspaceId,
      horizonDays: input.query.horizonDays,
      timeZone: reader.timezone,
      accountId,
      now,
    },
    dependencies.forecast,
  );
  const recurringNames = new Map(
    forecast.recurringItems.map((item) => [item.id, item.name]),
  );
  const accountNames = new Map(
    forecast.accounts.map((account) => [account.id, account.name]),
  );
  const selected =
    forecast.accounts.find(
      (account) => account.id === forecast.selectedAccountId,
    ) ?? null;
  const firstPoints = forecast.currencies[0]?.points ?? [];

  return {
    resolved: true as const,
    basis: "PROJECTION" as const,
    isGuaranteed: false as const,
    postsTransactions: false as const,
    changesBalances: false as const,
    semantics: FORECAST_SEMANTICS,
    horizonDays: forecast.horizonDays,
    from: firstPoints[0]?.date ?? localDay(now, reader.timezone),
    to: firstPoints.at(-1)?.date ?? null,
    account: selected ? { id: selected.id, name: selected.name } : null,
    currenciesAreNeverCombined: true as const,
    currencies: forecast.currencies.map((currency) =>
      presentCurrencyForecast(
        currency,
        recurringNames,
        accountNames,
        reader.timezone,
      ),
    ),
    accounts: forecast.accountProjections.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      currentBalance: {
        basis: "ACTUAL" as const,
        ...agentMoney(account.currentBalanceMinor, account.currency),
      },
      projectedBalance: {
        basis: "PROJECTION" as const,
        ...agentMoney(account.projectedBalanceMinor, account.currency),
      },
    })),
    recurringItemCount: forecast.recurringItemCount,
    mayGoNegative: !forecast.hasNonNegativeBalances,
  };
}

export async function listAgentRules(
  input: ReadScope & { readonly query: AgentRuleListQuery },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const overview = await readRules(input, reader, dependencies, {
    query: input.query.search ?? "",
    status: input.query.filter,
  });
  const visible = new Set(overview.visibleRuleIds);
  const matching = overview.rules
    .filter((rule) => visible.has(rule.id))
    .map(presentAgentRule);
  const listed = matching.slice(0, input.query.limit);
  return {
    filter: input.query.filter,
    semantics: RULE_SEMANTICS,
    counts: {
      notArchived: overview.kpis.total,
      enabled: overview.kpis.active,
      appliedThisMonth: overview.kpis.appliedThisMonth,
      sentForReviewThisMonth: overview.kpis.sentForReviewThisMonth,
    },
    matchingCount: matching.length,
    listedCount: listed.length,
    rules: listed,
  };
}

export async function getAgentRule(
  input: ReadScope & { readonly reference: RuleReference },
  dependencies: AgentPlansReadDependencies,
) {
  const reader = await requireReader(input, dependencies);
  const all = await readRules(input, reader, dependencies, {
    query: "",
    status: "ALL",
  });
  const located = requireKnownId(
    input.reference.ruleId,
    resolveRuleReference(input.reference, all.rules),
    "Rule not found in this workspace.",
  );
  if (located.status !== "RESOLVED") {
    return {
      resolved: false as const,
      reason: located.status,
      candidates: located.candidates.map(presentAgentRule),
    };
  }

  const detail = await readRules(input, reader, dependencies, {
    query: "",
    status: "ALL",
    ruleId: located.item.id,
  });
  return {
    resolved: true as const,
    semantics: RULE_SEMANTICS,
    rule: presentAgentRule(located.item),
    statusMeaning:
      located.item.status === "ACTIVE"
        ? "Enabled. It is evaluated for each new transaction."
        : located.item.status === "PAUSED"
          ? "Disabled. It is kept but not evaluated until it is enabled."
          : "Archived. It is kept for history and can no longer be enabled or edited.",
    recentExecutions: (detail.selected?.executions ?? []).map((execution) => ({
      transactionId: execution.transactionId,
      outcome: execution.outcome,
      reason: execution.reason,
      executedAt: execution.executedAt,
      transaction: execution.transaction
        ? {
            label: execution.transaction.label,
            kind: execution.transaction.kind,
            amount: agentMoney(
              execution.transaction.amountMinor,
              execution.transaction.currency,
            ),
            occurredAt: execution.transaction.occurredAt,
          }
        : null,
    })),
  };
}

async function requireReader(
  input: ReadScope,
  dependencies: AgentPlansReadDependencies,
): Promise<Reader> {
  const context = await dependencies.workspaces.findMemberContext(
    input.workspaceId,
    input.actor.userId,
  );
  if (!context)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(context.membership.role, "read");
  return {
    role: context.membership.role,
    currency: context.preferences.currency,
    timezone: context.preferences.timezone,
  };
}

async function readBudgets(
  input: ReadScope,
  reader: Reader,
  dependencies: AgentPlansReadDependencies,
): Promise<AgentBudgetView[]> {
  const [summaries, categories] = await Promise.all([
    safeBudgetRead(() =>
      dependencies.plans.listBudgetSummaries(
        input.actor,
        input.workspaceId,
        input.now,
      ),
    ),
    dependencies.rules.listCategories(input.actor, input.workspaceId),
  ]);
  return summaries.map((summary) =>
    presentAgentBudget(summary, categories, reader.timezone),
  );
}

async function readGoals(
  input: ReadScope,
  reader: Reader,
  dependencies: AgentPlansReadDependencies,
) {
  const summaries = await dependencies.plans.listSavingsGoalSummaries(
    input.actor,
    input.workspaceId,
    input.now,
  );
  return summaries.map((summary) => presentAgentGoal(summary, reader.timezone));
}

function readRules(
  input: ReadScope,
  reader: Reader,
  dependencies: AgentPlansReadDependencies,
  filters: {
    readonly query: string;
    readonly status: AgentRuleListQuery["filter"];
    readonly ruleId?: string;
  },
) {
  return getRulesOverviewWithReaders(
    {
      actor: input.actor,
      workspaceId: input.workspaceId,
      role: reader.role,
      timeZone: reader.timezone,
      now: input.now,
      ...filters,
    },
    dependencies.rules,
  );
}

/**
 * The canonical budget engine refuses to total spending across currencies.
 * That refusal is reported to the member instead of surfacing as a failure.
 */
export async function safeBudgetRead<TResult>(
  read: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof CurrencyMismatchError) {
      throw new ConflictError(
        "Budget spending cannot be calculated because this workspace has spending in more than one currency and Pace does not convert currencies.",
      );
    }
    throw error;
  }
}

function requireKnownId<TItem>(
  id: string | null | undefined,
  resolution: PlanReferenceResolution<TItem>,
  message: string,
): PlanReferenceResolution<TItem> {
  if (id && resolution.status !== "RESOLVED") throw new NotFoundError(message);
  return resolution;
}

function unresolved<TItem>(
  resolution: Exclude<
    PlanReferenceResolution<TItem>,
    { readonly status: "RESOLVED" }
  >,
) {
  return {
    resolved: false as const,
    reason: resolution.status,
    candidates: resolution.candidates,
  };
}

function scopeMeaning(budget: AgentBudgetView): string {
  switch (budget.scope) {
    case "OVERALL":
      return "Counts all spending in the workspace currency, whatever its category.";
    case "WHOLE_CATEGORY":
      return `Counts spending in ${budget.label} and in every one of its subcategories.`;
    case "SELECTED_SUBCATEGORIES":
      return `Counts spending only in the selected subcategories of ${budget.label}: ${budget.subcategories
        .map((subcategory) => subcategory.name)
        .join(", ")}.`;
  }
}

function presentCurrencyForecast(
  forecast: CurrencyForecast,
  recurringNames: ReadonlyMap<string, string | null>,
  accountNames: ReadonlyMap<string, string>,
  timeZone: string,
) {
  const { currency } = forecast;
  const closing =
    forecast.points.at(-1)?.projectedClosingBalance ?? forecast.openingBalance;
  const lowest = forecast.points.reduce<
    (typeof forecast.points)[number] | null
  >(
    (low, point) =>
      !low ||
      BigInt(point.projectedClosingBalance.nominalMinor) <
        BigInt(low.projectedClosingBalance.nominalMinor)
        ? point
        : low,
    null,
  );
  const byRecurring = new Map<string, ForecastEvent[]>();
  for (const event of forecast.events) {
    byRecurring.set(event.recurringId, [
      ...(byRecurring.get(event.recurringId) ?? []),
      event,
    ]);
  }

  return {
    currency,
    currentBalance: {
      basis: "ACTUAL" as const,
      ...agentMoney(forecast.openingBalance.nominalMinor, currency),
    },
    projectedInflows: projected(forecast.totalInflows, currency),
    projectedOutflows: projected(forecast.totalOutflows, currency),
    projectedBalance: projected(closing, currency),
    lowestProjectedBalance: lowest
      ? {
          on: lowest.date,
          ...projected(lowest.projectedClosingBalance, currency),
        }
      : null,
    hasVariableAmounts: forecast.events.some(
      (event) => event.amount.uncertainty === "VARIABLE",
    ),
    recurringItems: [...byRecurring.entries()].map(([recurringId, events]) => ({
      recurringId,
      name: recurringNames.get(recurringId) ?? "Recurring payment",
      direction:
        events[0]!.direction === "INFLOW"
          ? ("INCOME" as const)
          : ("EXPENSE" as const),
      account: events[0]!.accountId
        ? {
            id: events[0]!.accountId,
            name: accountNames.get(events[0]!.accountId) ?? null,
          }
        : null,
      occurrenceCount: events.length,
      expectedOn: events.map((event) =>
        localDay(new Date(event.occursAt), timeZone),
      ),
      amountPerOccurrence: projected(events[0]!.amount, currency),
      projectedTotal: agentMoney(
        events.reduce(
          (total, event) => total + BigInt(event.amount.nominalMinor),
          0n,
        ),
        currency,
      ),
    })),
  };
}

function projected(amount: ForecastAmount, currency: string) {
  return {
    basis: "PROJECTION" as const,
    ...agentMoney(amount.nominalMinor, currency),
    lowEstimateMinorUnits: amount.minimumMinor,
    highEstimateMinorUnits: amount.maximumMinor,
    isRange: amount.uncertainty === "VARIABLE",
  };
}
