import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission, type WorkspaceRole } from "@/authorization/workspace-permissions";
import type { GetInsightsRecurringInput } from "@/modules/insights/recurring/get-insights-recurring";
import type { InsightsRecurring, RecurringTopItem } from "@/modules/insights/recurring/insights-recurring.types";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import { isCurrencyCode } from "@/money/currency";
import { calendarMonthPeriod } from "@/money/period";

import type {
  AgentRecurringListQuery,
  AgentRecurringSpendingQuery,
  AgentRecurringState,
  AgentUpcomingRecurringQuery,
} from "../domain/agent-recurring-query";
import { frequencyForCadenceDays } from "../domain/recurring-frequency";
import { buildRecurringOverview, type RecurringOverviewItem } from "../domain/recurring-overview";
import {
  resolveRecurringReference,
  withRecurringDisplayNames,
  type RecurringReference,
  type RecurringReferenceResolution,
} from "../domain/recurring-reference";
import { getRecurringDetailWithReaders, type RecurringDetailReaders } from "./get-recurring-detail";

export type AgentRecurringReadDependencies = {
  readonly readers: RecurringDetailReaders;
  readonly readAnalytics: (input: GetInsightsRecurringInput) => Promise<InsightsRecurring>;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};

type ReadScope = { readonly actor: AuthenticatedActor; readonly workspaceId: string; readonly now?: Date };
type Reader = {
  readonly role: WorkspaceRole;
  readonly currency: string;
  readonly locale: string;
  readonly timezone: string;
};

const HISTORY_LIMIT = 12;
const PROJECTION_LIMIT = 6;
const UNNAMED = "Recurring payment";

const STATE_MEANINGS: Readonly<Record<AgentRecurringState, string>> = {
  ACTIVE:
    "Confirmed and active. Pace projects its future occurrences. A projection is not a Transaction and never changes a balance.",
  PAUSED:
    "Confirmed but paused. Pace shows no future projections for it until it is resumed. Its past Transactions are unchanged.",
  NEEDS_REVIEW:
    "Detected by Pace from past Transactions and not confirmed yet. It is a suggestion until a member confirms or ignores it, and it is not projected.",
  IGNORED:
    "A detected pattern a member chose to ignore. Pace does not project it. Its Transactions are unchanged and it can be restored to review.",
};

export async function listAgentRecurring(
  input: ReadScope & { readonly query: AgentRecurringListQuery },
  dependencies: AgentRecurringReadDependencies,
) {
  const items = (await readAllItems(input, await requireReader(input, dependencies), dependencies)).map(presentItem);
  const inState = (state: AgentRecurringState) => items.filter((item) => item.state === state);
  const matching = input.query.filter === "ALL" ? items : inState(input.query.filter);
  const listed = matching.slice(0, input.query.limit);

  return {
    filter: input.query.filter,
    counts: {
      all: items.length,
      active: inState("ACTIVE").length,
      paused: inState("PAUSED").length,
      needsReview: inState("NEEDS_REVIEW").length,
      ignored: inState("IGNORED").length,
    },
    matchingCount: matching.length,
    listedCount: listed.length,
    items: listed,
  };
}

/**
 * Inspects one recurring item. History holds only real linked Transactions and
 * projections only future dates from the persisted cadence, so the two can
 * never be mistaken for each other.
 */
export async function getAgentRecurring(
  input: ReadScope & { readonly reference: RecurringReference },
  dependencies: AgentRecurringReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const located = requireKnownId(
    input.reference,
    resolveRecurringReference(input.reference, await readAllItems(input, preferences, dependencies)),
  );
  if (located.status !== "RESOLVED") return unresolved(located);

  const detail = await getRecurringDetailWithReaders(
    {
      actor: input.actor,
      workspaceId: input.workspaceId,
      recurringId: located.recurring.id,
      timeZone: preferences.timezone,
      now: input.now ?? new Date(),
    },
    dependencies.readers,
  );
  if (!detail) throw new NotFoundError("Recurring payment not found in this workspace.");

  const recurring = presentItem(located.recurring);
  const transactions = detail.history.slice(0, HISTORY_LIMIT).map((entry) => ({
    transactionId: entry.transaction.id,
    occurredAt: entry.date,
    amount: money(entry.amount.minor, entry.amount.currency),
  }));
  const occurrences =
    recurring.state === "ACTIVE"
      ? detail.upcomingOccurrences.slice(0, PROJECTION_LIMIT).map((occurrence) => ({
          expectedAt: occurrence.date,
          typicalAmount: money(occurrence.amount.minor, occurrence.amount.currency),
        }))
      : [];

  return {
    resolved: true as const,
    recurring,
    stateMeaning: STATE_MEANINGS[recurring.state],
    history: {
      basis: "REAL_TRANSACTIONS" as const,
      transactionCount: detail.history.length,
      listedCount: transactions.length,
      lastPaidAt: detail.history[0]?.date ?? null,
      transactions,
    },
    projections: {
      basis: "PROJECTION" as const,
      affectsBalances: false as const,
      countsAsActual: false as const,
      occurrences,
    },
  };
}

/** Actual recurring spending and income: real effective Transactions linked to confirmed items, never projections. */
export async function getAgentRecurringSpending(
  input: ReadScope & { readonly query: AgentRecurringSpendingQuery },
  dependencies: AgentRecurringReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const now = input.now ?? new Date();
  const month = calendarMonthPeriod(now, preferences.timezone, input.query.period === "LAST_MONTH" ? -1 : 0);
  const analytics = await readAnalytics(input, preferences, dependencies, {
    periodKey: overviewPeriodKey(month, preferences.timezone),
    horizon: "30d",
    currency: input.query.currency,
    now,
  });
  const { currency, actual, topItems } = analytics;
  const presentActual = (item: RecurringTopItem) => ({
    recurringId: item.id,
    name: item.name ?? UNNAMED,
    state: stateOf(item),
    actualAmount: money(item.actualMinor, currency),
    transactionCount: item.paymentCount,
    latestTransactionId: item.latestTransactionId,
    latestPaidOn: item.latestDate,
  });

  return {
    basis: "ACTUAL_TRANSACTIONS" as const,
    includesProjections: false as const,
    period: {
      name: input.query.period,
      from: analytics.current.firstDate,
      to: analytics.current.lastDate,
      isInProgress: analytics.current.isPartial,
    },
    currency,
    recurringSpending: money(actual.spending.minor, currency),
    recurringIncome: money(actual.income.minor, currency),
    totalSpending: money(actual.totalSpendingMinor, currency),
    recurringShareOfSpendingBps: actual.shareBps,
    paidRecurringCount: actual.paidCount,
    listedItemsAreComplete: topItems.outflows.length + topItems.inflows.length >= actual.paidCount,
    spendingItems: topItems.outflows.map(presentActual),
    incomeItems: topItems.inflows.map(presentActual),
    otherCurrencies: otherCurrencies(analytics),
  };
}

/** Projected occurrences of confirmed, active recurring items. Nothing here has been paid or posted. */
export async function getAgentUpcomingRecurring(
  input: ReadScope & { readonly query: AgentUpcomingRecurringQuery },
  dependencies: AgentRecurringReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const analytics = await readAnalytics(input, preferences, dependencies, {
    periodKey: undefined,
    horizon: input.query.horizon,
    currency: input.query.currency,
    now: input.now ?? new Date(),
  });
  const { currency, upcoming } = analytics;
  const dueBy = input.query.dueWithinDays === undefined ? null : addDays(upcoming.firstDate, input.query.dueWithinDays);
  const occurrences = upcoming.items
    .filter((item) => dueBy === null || item.date <= dueBy)
    .map((item) => ({
      recurringId: item.recurringId,
      name: item.name ?? UNNAMED,
      direction: item.flow === "INFLOW" ? ("INCOME" as const) : ("EXPENSE" as const),
      expectedOn: item.date,
      typicalAmount: money(item.amountMinor, currency),
      amountIsVariable: item.isVariable,
    }));

  return {
    basis: "PROJECTION" as const,
    affectsBalances: false as const,
    countsAsActual: false as const,
    currency,
    horizon: {
      name: upcoming.horizon,
      from: upcoming.firstDate,
      to: upcoming.lastDate,
      projectedOutflows: money(upcoming.outflowMinor, currency),
      projectedInflows: money(upcoming.inflowMinor, currency),
      occurrenceCount: upcoming.occurrenceCount,
      recurringCount: upcoming.commitmentCount,
      hasVariableAmounts: upcoming.hasVariableAmounts,
    },
    dueBy,
    listedCount: occurrences.length,
    unlistedCount: upcoming.remainingCount,
    occurrences,
    otherCurrencies: otherCurrencies(analytics),
  };
}

async function requireReader(input: ReadScope, dependencies: AgentRecurringReadDependencies): Promise<Reader> {
  const context = await dependencies.workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!context) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(context.membership.role, "read");
  return { role: context.membership.role, ...context.preferences };
}

async function readAllItems(
  input: ReadScope,
  reader: Reader,
  { readers }: AgentRecurringReadDependencies,
): Promise<readonly RecurringOverviewItem[]> {
  const [payments, accounts, categories, merchants] = await Promise.all([
    readers.listRecurring(input.actor, input.workspaceId),
    readers.listAccounts(input.actor, input.workspaceId),
    readers.listCategories(input.actor, input.workspaceId),
    readers.listMerchants(input.actor, input.workspaceId),
  ]);
  const overview = buildRecurringOverview({
    payments,
    accounts,
    categories,
    filter: "ALL",
    timeZone: reader.timezone,
    now: input.now ?? new Date(),
    workspaceRole: reader.role,
  });
  return withRecurringDisplayNames(overview.items, payments, merchants);
}

async function readAnalytics(
  input: ReadScope,
  preferences: Reader,
  dependencies: AgentRecurringReadDependencies,
  query: Pick<GetInsightsRecurringInput, "periodKey" | "horizon" | "now"> & { readonly currency?: string },
): Promise<InsightsRecurring> {
  const requestedCurrency = query.currency?.trim().toUpperCase() ?? null;
  if (requestedCurrency && !isCurrencyCode(requestedCurrency)) {
    throw new ConflictError("Use a supported ISO currency code.");
  }
  const analytics = await dependencies.readAnalytics({
    actor: input.actor,
    workspaceId: input.workspaceId,
    workspaceCurrency: preferences.currency,
    locale: preferences.locale,
    timeZone: preferences.timezone,
    range: "1m",
    horizon: query.horizon,
    periodKey: query.periodKey,
    requestedCurrency,
    now: query.now,
  });
  if (requestedCurrency && analytics.currency !== requestedCurrency) {
    throw new ConflictError(`This workspace has no recurring activity in ${requestedCurrency}.`);
  }
  return analytics;
}

function requireKnownId(
  reference: RecurringReference,
  resolution: RecurringReferenceResolution<RecurringOverviewItem>,
): RecurringReferenceResolution<RecurringOverviewItem> {
  if (reference.recurringId && resolution.status !== "RESOLVED") {
    throw new NotFoundError("Recurring payment not found in this workspace.");
  }
  return resolution;
}

function unresolved(
  resolution: Exclude<RecurringReferenceResolution<RecurringOverviewItem>, { readonly status: "RESOLVED" }>,
) {
  return {
    resolved: false as const,
    reason: resolution.status,
    candidates: resolution.candidates.map(presentItem),
  };
}

function presentItem(item: RecurringOverviewItem) {
  const state = stateOf(item);
  const { capabilities } = item;
  return {
    id: item.id,
    name: item.merchantName,
    direction: item.direction === "INFLOW" ? ("INCOME" as const) : ("EXPENSE" as const),
    provenance: item.origin === "MANUAL" ? ("MANUAL" as const) : ("DETECTED" as const),
    state,
    typicalAmount: money(item.typicalAmountMinor, item.currency),
    cadenceDays: item.cadenceDays,
    frequency: frequencyForCadenceDays(item.cadenceDays),
    account: item.account,
    category: item.category ? { id: item.category.id, name: item.category.name } : null,
    nextProjectedAt: state === "ACTIVE" ? item.nextExpectedAt : null,
    allowedActions: {
      canEdit: capabilities.canEdit,
      canPause: capabilities.canPause,
      canResume: capabilities.canResume,
      canConfirm: capabilities.canConfirm,
      canIgnore: capabilities.canIgnore,
      canRestore: capabilities.canRestore,
      canDelete: capabilities.canDelete,
      reasons: capabilities.reasons,
    },
  };
}

function stateOf(item: Pick<RecurringOverviewItem, "status" | "lifecycle">): AgentRecurringState {
  if (item.status === "IGNORED") return "IGNORED";
  if (item.status === "CANDIDATE") return "NEEDS_REVIEW";
  return item.lifecycle === "PAUSED" ? "PAUSED" : "ACTIVE";
}

function otherCurrencies(analytics: InsightsRecurring): string[] {
  return analytics.currencies.map((option) => option.code).filter((code) => code !== analytics.currency);
}

function addDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function money(minorUnits: string, currency: string) {
  return { minorUnits, currency };
}
