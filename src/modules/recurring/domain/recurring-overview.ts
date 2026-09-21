import type { LedgerAccountRecord, LedgerCategoryRecord } from "@/modules/ledger/domain";
import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";
import type { RecurringPaymentView } from "@/modules/financial-inbox/financial-inbox-service";
import { nextExpectedRecurringDate } from "@/modules/overview/domain/overview-right-rail";

export const RECURRING_OVERVIEW_FILTERS = ["ALL", "CONFIRMED", "NEEDS_REVIEW", "IGNORED"] as const;

export type RecurringOverviewFilter = (typeof RECURRING_OVERVIEW_FILTERS)[number];

export type RecurringOverviewItem = {
  readonly id: string;
  readonly merchantName: string;
  /** M4 only detects posted EXPENSE patterns; there are currently no recurring inflows or transfers. */
  readonly direction: "OUTFLOW";
  readonly origin: "DETERMINISTIC_DETECTION";
  /** The M4 amount is the median of matching posted-expense samples, not a fixed scheduled charge. */
  readonly amountKind: "TYPICAL";
  readonly typicalAmountMinor: string;
  readonly currency: string;
  /** M4 stores recurrence as a detected cadence in whole days, rather than a frequency enum. */
  readonly cadenceDays: number;
  readonly status: RecurringPaymentStatus;
  readonly reviewState: "NEEDS_REVIEW" | null;
  readonly account: { readonly id: string; readonly name: string } | null;
  readonly category: { readonly id: string; readonly name: string; readonly systemKey: string | null } | null;
  readonly firstOccurredAt: string;
  readonly lastOccurredAt: string;
  /** Deterministic projection from the persisted cadence; it is never a posted transaction. */
  readonly nextExpectedAt: string | null;
  readonly sampleCount: number;
};

export type RecurringCurrencyTotal = {
  readonly currency: string;
  readonly amountMinor: string;
};

export type RecurringUpcomingItem = Pick<
  RecurringOverviewItem,
  "id" | "merchantName" | "typicalAmountMinor" | "currency" | "category" | "nextExpectedAt"
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
}: {
  readonly payments: readonly RecurringPaymentView[];
  readonly accounts: readonly LedgerAccountRecord[];
  readonly categories: readonly LedgerCategoryRecord[];
  readonly filter: RecurringOverviewFilter;
  readonly timeZone: string;
  readonly now: Date;
}): RecurringOverview {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const items = payments
    .map((payment) => toOverviewItem(payment, accountById, categoryById, now, timeZone))
    .sort(compareByNextExpected);

  const counts = {
    ALL: items.length,
    CONFIRMED: items.filter((item) => item.status === "CONFIRMED").length,
    NEEDS_REVIEW: items.filter((item) => item.reviewState === "NEEDS_REVIEW").length,
    IGNORED: items.filter((item) => item.status === "IGNORED").length,
  } as const satisfies Readonly<Record<RecurringOverviewFilter, number>>;

  const confirmed = items.filter((item) => item.status === "CONFIRMED");
  const upcomingCutoff = new Date(now.getTime() + 30 * 86_400_000);
  const upcoming = confirmed
    .filter((item): item is RecurringOverviewItem & { readonly nextExpectedAt: string } =>
      item.nextExpectedAt !== null && new Date(item.nextExpectedAt).getTime() <= upcomingCutoff.getTime(),
    )
    .slice(0, 8)
    .map(({ id, merchantName, typicalAmountMinor, currency, category, nextExpectedAt }) => ({
      id,
      merchantName,
      typicalAmountMinor,
      currency,
      category,
      nextExpectedAt,
    }));

  return {
    filter,
    counts,
    confirmedOutflows: groupByCurrency(confirmed),
    expectedUpcoming: groupByCurrency(upcoming),
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
): RecurringOverviewItem {
  const account = payment.accountId ? accountById.get(payment.accountId) ?? null : null;
  const category = payment.categoryId ? categoryById.get(payment.categoryId) ?? null : null;
  return {
    id: payment.id,
    merchantName: payment.normalizedMerchant,
    direction: "OUTFLOW",
    origin: "DETERMINISTIC_DETECTION",
    amountKind: "TYPICAL",
    typicalAmountMinor: payment.typicalAmountMinor,
    currency: payment.currency,
    cadenceDays: payment.cadenceDays,
    status: payment.status,
    reviewState: payment.status === "CANDIDATE" ? "NEEDS_REVIEW" : null,
    account: account ? { id: account.id, name: account.name } : null,
    category: category ? { id: category.id, name: category.name, systemKey: category.systemKey } : null,
    firstOccurredAt: payment.firstOccurredAt,
    lastOccurredAt: payment.lastOccurredAt,
    nextExpectedAt: payment.status === "IGNORED"
      ? null
      : nextExpectedRecurringDate(payment.lastOccurredAt, payment.cadenceDays, now, timeZone),
    sampleCount: payment.sampleTransactionIds.length,
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
