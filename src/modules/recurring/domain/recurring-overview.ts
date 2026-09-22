import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";
import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import { nextRecurringProjectionDate } from "@/modules/overview/domain/overview-right-rail";
import type { WorkspaceRole } from "@/authorization/workspace-permissions";

import { getRecurringCapabilities, type RecurringCapabilities } from "./recurring-action-policy";

export const RECURRING_OVERVIEW_FILTERS = ["ALL", "CONFIRMED", "NEEDS_REVIEW", "IGNORED"] as const;

export type RecurringOverviewFilter = (typeof RECURRING_OVERVIEW_FILTERS)[number];

export type RecurringOverviewItem = {
  readonly id: string;
  readonly merchantName: string;
  readonly direction: "OUTFLOW" | "INFLOW";
  readonly origin: "DETERMINISTIC_DETECTION" | "MANUAL";
  readonly amountKind: "TYPICAL";
  readonly typicalAmountMinor: string;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: RecurringPaymentView["lifecycle"];
  readonly reviewState: "NEEDS_REVIEW" | null;
  readonly capabilities: RecurringCapabilities;
  readonly account: { readonly id: string; readonly name: string } | null;
  readonly category: { readonly id: string; readonly name: string; readonly systemKey: string | null } | null;
  readonly firstOccurredAt: string;
  readonly lastOccurredAt: string;
  /** Deterministic projection from the persisted cadence; it is never a posted transaction. */
  readonly nextExpectedAt: string | null;
  readonly sampleCount: number;
  /** Canonical optimistic-concurrency token for review-state actions. */
  readonly updatedAt: string;
};

export type RecurringCurrencyTotal = {
  readonly currency: string;
  readonly amountMinor: string;
};

export type RecurringUpcomingItem = Pick<
  RecurringOverviewItem,
  "id" | "merchantName" | "direction" | "typicalAmountMinor" | "currency" | "category" | "nextExpectedAt"
>;

export type RecurringOverview = {
  readonly filter: RecurringOverviewFilter;
  readonly counts: Readonly<Record<RecurringOverviewFilter, number>>;
  /** Confirmed patterns only. Candidates remain visible separately as items needing review. */
  readonly confirmedOutflows: readonly RecurringCurrencyTotal[];
  /** A 30-day projection of confirmed patterns only; it does not affect balances or ledger reporting. */
  readonly expectedUpcoming: readonly RecurringCurrencyTotal[];
  readonly items: readonly RecurringOverviewItem[];
  readonly upcoming: readonly RecurringUpcomingItem[];
};

export function parseRecurringOverviewFilter(
  value: string | string[] | undefined,
): RecurringOverviewFilter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "CONFIRMED" || candidate === "NEEDS_REVIEW" || candidate === "IGNORED"
    ? candidate
    : "ALL";
}

export function recurringOverviewHref(pathname: string, filter: RecurringOverviewFilter): string {
  return filter === "ALL" ? pathname : `${pathname}?filter=${filter}`;
}

export function buildRecurringOverview({
  payments,
  accounts,
  categories,
  filter,
  timeZone,
  now,
  workspaceRole,
}: {
  readonly payments: readonly RecurringPaymentView[];
  readonly accounts: readonly LedgerAccountRecord[];
  readonly categories: readonly LedgerCategoryRecord[];
  readonly filter: RecurringOverviewFilter;
  readonly workspaceRole: WorkspaceRole;
  readonly timeZone: string;
  readonly now: Date;
}): RecurringOverview {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const items = payments
    .map((payment) => toOverviewItem(payment, accountById, categoryById, now, timeZone, workspaceRole))
    .sort(compareByNextExpected);

  const counts = {
    ALL: items.length,
    CONFIRMED: items.filter((item) => item.status === "CONFIRMED").length,
    NEEDS_REVIEW: items.filter((item) => item.reviewState === "NEEDS_REVIEW").length,
    IGNORED: items.filter((item) => item.status === "IGNORED").length,
  } as const satisfies Readonly<Record<RecurringOverviewFilter, number>>;

  const confirmed = items.filter((item) => item.status === "CONFIRMED" && item.lifecycle === "ACTIVE");
  const confirmedOutflows = confirmed.filter((item) => item.direction === "OUTFLOW");
  const upcomingCutoff = new Date(now.getTime() + 30 * 86_400_000);
  const upcoming = confirmed
    .filter((item): item is RecurringOverviewItem & { readonly nextExpectedAt: string } =>
      item.nextExpectedAt !== null && new Date(item.nextExpectedAt).getTime() <= upcomingCutoff.getTime(),
    )
    .slice(0, 8)
    .map(({ id, merchantName, direction, typicalAmountMinor, currency, category, nextExpectedAt }) => ({
      id,
      merchantName,
      direction,
      typicalAmountMinor,
      currency,
      category,
      nextExpectedAt,
    }));

  return {
    filter,
    counts,
    confirmedOutflows: groupByCurrency(confirmedOutflows),
    expectedUpcoming: groupByCurrency(upcoming.filter((item) => item.direction === "OUTFLOW")),
    items: filterItems(items, filter),
    upcoming,
  };
}

function toOverviewItem(
  payment: RecurringPaymentView,
  accountById: ReadonlyMap<string, LedgerAccountRecord>,
  categoryById: ReadonlyMap<string, LedgerCategoryRecord>,
  now: Date,
  timeZone: string,
  workspaceRole: WorkspaceRole,
): RecurringOverviewItem {
  const account = payment.accountId ? accountById.get(payment.accountId) ?? null : null;
  const category = payment.categoryId ? categoryById.get(payment.categoryId) ?? null : null;
  return {
    id: payment.id,
    merchantName: payment.displayName ?? payment.normalizedMerchant ?? "Recurring payment",
    direction: payment.direction === "INCOME" ? "INFLOW" : "OUTFLOW",
    origin: payment.origin === "MANUAL" ? "MANUAL" : "DETERMINISTIC_DETECTION",
    amountKind: "TYPICAL",
    typicalAmountMinor: payment.typicalAmountMinor,
    currency: payment.currency,
    cadenceDays: payment.cadenceDays,
    status: payment.status,
    lifecycle: payment.lifecycle,
    reviewState: payment.status === "CANDIDATE" ? "NEEDS_REVIEW" : null,
    capabilities: getRecurringCapabilities({ recurring: payment, workspaceRole }),
    account: account ? { id: account.id, name: account.name } : null,
    category: category ? { id: category.id, name: category.name, systemKey: category.systemKey } : null,
    firstOccurredAt: payment.firstOccurredAt,
    lastOccurredAt: payment.lastOccurredAt,
    nextExpectedAt: payment.status === "IGNORED" || payment.lifecycle === "PAUSED"
      ? null
      : nextRecurringProjectionDate(payment, now, timeZone),
    sampleCount: payment.sampleTransactionIds.length,
    updatedAt: payment.updatedAt,
  };
}

function filterItems(
  items: readonly RecurringOverviewItem[],
  filter: RecurringOverviewFilter,
): readonly RecurringOverviewItem[] {
  switch (filter) {
    case "CONFIRMED":
      return items.filter((item) => item.status === "CONFIRMED");
    case "NEEDS_REVIEW":
      return items.filter((item) => item.reviewState === "NEEDS_REVIEW");
    case "IGNORED":
      return items.filter((item) => item.status === "IGNORED");
    case "ALL":
    default:
      return items;
  }
}

function groupByCurrency(
  items: readonly Pick<RecurringOverviewItem, "currency" | "typicalAmountMinor">[],
): readonly RecurringCurrencyTotal[] {
  const totals = new Map<string, bigint>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + BigInt(item.typicalAmountMinor));
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountMinor]) => ({ currency, amountMinor: amountMinor.toString() }));
}

function compareByNextExpected(left: RecurringOverviewItem, right: RecurringOverviewItem): number {
  const leftTime = left.nextExpectedAt ? new Date(left.nextExpectedAt).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right.nextExpectedAt ? new Date(right.nextExpectedAt).getTime() : Number.POSITIVE_INFINITY;
  return leftTime - rightTime || left.merchantName.localeCompare(right.merchantName) || left.id.localeCompare(right.id);
}
