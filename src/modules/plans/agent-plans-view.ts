import type { LedgerCategoryRecord } from "@/modules/ledger/domain";
import { localDateForInstant, localDateKey } from "@/money/period";

import {
  SAVINGS_GOAL_STATUSES,
  type BudgetStatus,
  type BudgetSummary,
  type SavingsGoalContribution,
  type SavingsGoalStatus,
  type SavingsGoalSummary,
} from "./domain";
import { RULE_STATUS_FILTERS, type RuleListItem } from "./rules/rules-overview";

export const AGENT_BUDGET_FILTERS = ["ACTIVE", "ARCHIVED", "ALL"] as const;
export type AgentBudgetFilter = (typeof AGENT_BUDGET_FILTERS)[number];

export const AGENT_GOAL_FILTERS = ["ALL", ...SAVINGS_GOAL_STATUSES] as const;
export type AgentGoalFilter = (typeof AGENT_GOAL_FILTERS)[number];

export const AGENT_RULE_FILTERS = RULE_STATUS_FILTERS;
export type AgentRuleFilter = (typeof AGENT_RULE_FILTERS)[number];

export const AGENT_FORECAST_HORIZONS = [30, 60, 90] as const;
export type AgentForecastHorizon = (typeof AGENT_FORECAST_HORIZONS)[number];

export interface AgentPlanListQuery<TFilter extends string> {
  readonly filter: TFilter;
  readonly limit: number;
}

export interface AgentRuleListQuery extends AgentPlanListQuery<AgentRuleFilter> {
  readonly search?: string;
}

export interface AgentForecastQuery {
  readonly horizonDays: AgentForecastHorizon;
  readonly accountName?: string;
}

export interface BudgetReference {
  readonly budgetId?: string | null;
  readonly categoryName?: string | null;
  readonly overall?: boolean | null;
  /** Calendar month the budget covers, YYYY-MM. */
  readonly month?: string | null;
}

export interface GoalReference {
  readonly goalId?: string | null;
  readonly goalName?: string | null;
}

export interface RuleReference {
  readonly ruleId?: string | null;
  readonly ruleName?: string | null;
}

export type PlanReferenceResolution<TItem> =
  | { readonly status: "RESOLVED"; readonly item: TItem }
  | {
      readonly status: "AMBIGUOUS" | "NOT_FOUND";
      readonly candidates: readonly TItem[];
    };

export interface AgentMoney {
  readonly minorUnits: string;
  readonly currency: string;
}

export type AgentBudgetScope =
  | "OVERALL"
  | "WHOLE_CATEGORY"
  | "SELECTED_SUBCATEGORIES";

export interface AgentBudgetView {
  readonly id: string;
  readonly label: string;
  readonly scope: AgentBudgetScope;
  readonly category: { readonly id: string; readonly name: string } | null;
  readonly subcategories: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly status: BudgetStatus;
  readonly amount: AgentMoney;
  readonly startsOn: string;
  /** Last calendar day the budget covers; null when it has no end. */
  readonly endsOn: string | null;
  readonly firstMonth: string;
  readonly lastMonth: string | null;
  readonly isTrackedThisMonth: boolean;
  readonly trackedPeriod: { readonly from: string; readonly to: string };
  readonly spent: AgentMoney;
  readonly remaining: AgentMoney;
  readonly utilizationPercent: string;
  readonly expectedUtilizationPercent: string;
  readonly overBudget: boolean;
  readonly allowedActions: BudgetSummary["capabilities"];
  readonly updatedAt: string;
}

export interface AgentGoalView {
  readonly id: string;
  readonly name: string;
  readonly status: SavingsGoalStatus;
  readonly target: AgentMoney;
  readonly saved: AgentMoney;
  readonly remaining: AgentMoney;
  readonly progressPercent: string;
  readonly targetDate: string | null;
  readonly daysRemaining: number | null;
  readonly requiredDaily: AgentMoney | null;
  readonly completed: boolean;
  readonly allowedActions: SavingsGoalSummary["capabilities"];
  readonly updatedAt: string;
}

export interface AgentContributionView {
  readonly id: string;
  readonly kind: SavingsGoalContribution["kind"];
  readonly amount: AgentMoney;
  readonly effectiveAt: string;
  readonly effectiveOn: string;
  readonly note: string | null;
  readonly reversesContributionId: string | null;
  readonly isReversed: boolean;
  readonly canCorrect: boolean;
  readonly canReverse: boolean;
}

export type AgentRuleView = ReturnType<typeof presentAgentRule>;

const OVERALL_LABEL = "Overall";

export function agentMoney(
  minorUnits: bigint | string,
  currency: string,
): AgentMoney {
  return { minorUnits: minorUnits.toString(), currency };
}

export function percentFromBps(bps: bigint): string {
  const sign = bps < 0n ? "-" : "";
  const absolute = bps < 0n ? -bps : bps;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function localDay(instant: Date, timeZone: string): string {
  return localDateKey(localDateForInstant(instant, timeZone));
}

export function presentAgentBudget(
  summary: BudgetSummary,
  categories: readonly Pick<LedgerCategoryRecord, "id" | "name">[],
  timeZone: string,
): AgentBudgetView {
  const { budget } = summary;
  const names = new Map(
    categories.map((category) => [category.id, category.name]),
  );
  const category = budget.categoryId
    ? {
        id: budget.categoryId,
        name: names.get(budget.categoryId) ?? "Unknown category",
      }
    : null;
  const startsOn = localDay(budget.startsOn, timeZone);
  const endsOn = budget.endsOn
    ? localDay(new Date(budget.endsOn.getTime() - 1), timeZone)
    : null;
  return {
    id: budget.id,
    label:
      budget.scope === "OVERALL" ? OVERALL_LABEL : (category?.name ?? "Budget"),
    scope:
      budget.scope === "OVERALL"
        ? "OVERALL"
        : budget.subcategoryIds.length > 0
          ? "SELECTED_SUBCATEGORIES"
          : "WHOLE_CATEGORY",
    category,
    subcategories: budget.subcategoryIds.map((id) => ({
      id,
      name: names.get(id) ?? "Unknown category",
    })),
    status: budget.status,
    amount: agentMoney(budget.amountMinor, budget.currency),
    startsOn,
    endsOn,
    firstMonth: startsOn.slice(0, 7),
    lastMonth: endsOn?.slice(0, 7) ?? null,
    isTrackedThisMonth: summary.activeForPeriod,
    trackedPeriod: {
      from: localDay(summary.periodStart, timeZone),
      to: localDay(new Date(summary.periodEnd.getTime() - 1), timeZone),
    },
    spent: agentMoney(summary.currentSpendMinor, budget.currency),
    remaining: agentMoney(summary.remainingMinor, budget.currency),
    utilizationPercent: percentFromBps(summary.percentageUsedBps),
    expectedUtilizationPercent: percentFromBps(summary.expectedUsageBps),
    overBudget: summary.overBudget,
    allowedActions: summary.capabilities,
    updatedAt: budget.updatedAt.toISOString(),
  };
}

export function presentAgentGoal(
  summary: SavingsGoalSummary,
  timeZone: string,
): AgentGoalView {
  const { goal } = summary;
  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    target: agentMoney(goal.targetAmountMinor, goal.currency),
    saved: agentMoney(goal.currentSavedMinor, goal.currency),
    remaining: agentMoney(summary.remainingMinor, goal.currency),
    progressPercent: percentFromBps(summary.progressBps),
    targetDate: goal.targetDate ? localDay(goal.targetDate, timeZone) : null,
    daysRemaining:
      summary.targetDateDaysRemaining === null
        ? null
        : Number(summary.targetDateDaysRemaining),
    requiredDaily:
      summary.requiredDailyMinor === null
        ? null
        : agentMoney(summary.requiredDailyMinor, goal.currency),
    completed: summary.completed,
    allowedActions: summary.capabilities,
    updatedAt: goal.updatedAt.toISOString(),
  };
}

export function presentAgentContributions(
  contributions: readonly SavingsGoalContribution[],
  canContribute: boolean,
  timeZone: string,
): AgentContributionView[] {
  const reversed = new Set(
    contributions.flatMap((entry) =>
      entry.reversesContributionId ? [entry.reversesContributionId] : [],
    ),
  );
  return contributions.map((entry) => {
    const adjustable =
      canContribute && entry.kind === "CONTRIBUTION" && !reversed.has(entry.id);
    return {
      id: entry.id,
      kind: entry.kind,
      amount: agentMoney(entry.amountMinor, entry.currency),
      effectiveAt: entry.effectiveAt.toISOString(),
      effectiveOn: localDay(entry.effectiveAt, timeZone),
      note: entry.note,
      reversesContributionId: entry.reversesContributionId,
      isReversed: reversed.has(entry.id),
      canCorrect: adjustable,
      canReverse: adjustable,
    };
  });
}

export function presentAgentRule(item: RuleListItem) {
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    priority: item.priority,
    origin: item.origin,
    runsWhen: "TRANSACTION_CREATED" as const,
    conditions: [...(item.trigger ? [item.trigger] : []), ...item.conditions],
    action:
      item.action.type === "ASSIGN_CATEGORY"
        ? {
            type: item.action.type,
            categoryId: item.action.categoryId,
            categoryName: item.action.categoryName,
          }
        : { type: item.action.type },
    appliedCount: item.appliedCount,
    lastAppliedAt: item.lastAppliedAt,
    allowedActions: item.capabilities,
    updatedAt: item.updatedAt,
  };
}

/**
 * Resolves the plan a member named. A name resolves only when exactly one item
 * carries it, so two items that could both be meant always come back as
 * candidates instead of a pick.
 */
export function resolvePlanName<TItem>(
  hint: string | null | undefined,
  items: readonly TItem[],
  nameOf: (item: TItem) => string,
): PlanReferenceResolution<TItem> {
  const normalizedHint = normalizePlanName(hint);
  if (!normalizedHint) return { status: "NOT_FOUND", candidates: items };

  const tiers = [
    (name: string) => name === normalizedHint,
    (name: string) => name.includes(normalizedHint),
    (name: string) => ` ${normalizedHint} `.includes(` ${name} `),
  ];
  for (const matches of tiers) {
    const matched = items.filter((candidate) =>
      matches(normalizePlanName(nameOf(candidate))),
    );
    if (matched.length === 1) return { status: "RESOLVED", item: matched[0]! };
    if (matched.length > 1) return { status: "AMBIGUOUS", candidates: matched };
  }
  return { status: "NOT_FOUND", candidates: items };
}

export function resolveBudgetReference(
  reference: BudgetReference,
  budgets: readonly AgentBudgetView[],
  options: { readonly preferTrackedThisMonth?: boolean } = {},
): PlanReferenceResolution<AgentBudgetView> {
  if (reference.budgetId) {
    const item = budgets.find(
      (candidate) => candidate.id === reference.budgetId,
    );
    return item
      ? { status: "RESOLVED", item }
      : { status: "NOT_FOUND", candidates: [] };
  }

  const month = reference.month ?? null;
  const pool = month
    ? budgets.filter((budget) => budgetCoversMonth(budget, month))
    : budgets;
  const named: PlanReferenceResolution<AgentBudgetView> = reference.overall
    ? narrow(
        pool.filter((budget) => budget.scope === "OVERALL"),
        pool,
      )
    : resolvePlanName(reference.categoryName, pool, (budget) => budget.label);
  if (named.status !== "AMBIGUOUS") return named;

  const active = named.candidates.filter(
    (budget) => budget.status === "ACTIVE",
  );
  const live = active.length > 0 ? active : named.candidates;
  if (live.length === 1) return { status: "RESOLVED", item: live[0]! };
  if (options.preferTrackedThisMonth) {
    const tracked = live.filter((budget) => budget.isTrackedThisMonth);
    if (tracked.length === 1) return { status: "RESOLVED", item: tracked[0]! };
  }
  return { status: "AMBIGUOUS", candidates: live };
}

export function resolveGoalReference(
  reference: GoalReference,
  goals: readonly AgentGoalView[],
): PlanReferenceResolution<AgentGoalView> {
  if (reference.goalId) {
    const item = goals.find((candidate) => candidate.id === reference.goalId);
    return item
      ? { status: "RESOLVED", item }
      : { status: "NOT_FOUND", candidates: [] };
  }
  return preferLive(
    resolvePlanName(reference.goalName, goals, (goal) => goal.name),
    (goal) => goal.status !== "ARCHIVED",
  );
}

export function resolveRuleReference<
  TRule extends {
    readonly id: string;
    readonly name: string;
    readonly status: string;
  },
>(
  reference: RuleReference,
  rules: readonly TRule[],
): PlanReferenceResolution<TRule> {
  if (reference.ruleId) {
    const item = rules.find((candidate) => candidate.id === reference.ruleId);
    return item
      ? { status: "RESOLVED", item }
      : { status: "NOT_FOUND", candidates: [] };
  }
  return preferLive(
    resolvePlanName(reference.ruleName, rules, (rule) => rule.name),
    (rule) => rule.status !== "ARCHIVED",
  );
}

function budgetCoversMonth(budget: AgentBudgetView, month: string): boolean {
  return (
    budget.firstMonth <= month &&
    (budget.lastMonth === null || month <= budget.lastMonth)
  );
}

function narrow<TItem>(
  matched: readonly TItem[],
  all: readonly TItem[],
): PlanReferenceResolution<TItem> {
  if (matched.length === 1) return { status: "RESOLVED", item: matched[0]! };
  return matched.length > 1
    ? { status: "AMBIGUOUS", candidates: matched }
    : { status: "NOT_FOUND", candidates: all };
}

function preferLive<TItem>(
  resolution: PlanReferenceResolution<TItem>,
  isLive: (item: TItem) => boolean,
): PlanReferenceResolution<TItem> {
  if (resolution.status !== "AMBIGUOUS") return resolution;
  const live = resolution.candidates.filter(isLive);
  return live.length === 1
    ? { status: "RESOLVED", item: live[0]! }
    : resolution;
}

function normalizePlanName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replaceAll(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}
