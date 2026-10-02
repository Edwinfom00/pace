import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import type { AccountLedgerEntry, AccountAnalysisAccount } from "@/modules/insights/account/account-analysis";
import { getInsightsTrendsWithReaders } from "@/modules/insights/trends/get-insights-trends";
import {
  buildInsightsTrends,
  type BuildInsightsTrendsInput,
  type TrendsRecurringPayment,
} from "@/modules/insights/trends/insights-trends";
import {
  DEFAULT_TRENDS_RANGE,
  parseTrendsRange,
  TRENDS_RANGES,
} from "@/modules/insights/trends/insights-trends.types";
import { nextInsightsRange } from "@/modules/insights/ui/components/insights-toolbar";
import { insightsCategoryHref, insightsSectionHref, insightsTrendsHref } from "@/modules/insights/ui/insights-links";
import { cashFlowChartData, cashFlowSummary, trendsQueryState, trendsSignalCopy } from "@/modules/insights/ui/trends-format";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

const timeZone = "UTC";
const labels = getDashboardLabels("en");
const midSeptember = new Date("2026-09-15T12:00:00.000Z");
const plain = (value: string) => value.replace(/[   ]/g, " ");

function entry(
  id: string,
  kind: AccountLedgerEntry["kind"],
  amountMinor: bigint,
  occurredOn: string,
  overrides: Partial<AccountLedgerEntry> = {},
): AccountLedgerEntry {
  return {
    id,
    kind,
    status: "POSTED",
    amountMinor,
    currency: "XAF",
    occurredAt: new Date(`${occurredOn}T12:00:00.000Z`),
    categoryId: null,
    merchantId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    accountId: "main",
    transferAccountId: null,
    ...overrides,
  };
}

const names: Record<string, string> = {
  groceries: "Groceries",
  housing: "Housing",
  dining: "Dining",
  subscriptions: "Subscriptions",
  salary: "Salary",
  a: "Alpha",
  b: "Beta",
};

const ledger: AccountLedgerEntry[] = [
  entry("salary-apr", "INCOME", 300_000n, "2026-04-01", { categoryId: "salary" }),
  entry("groceries-apr", "EXPENSE", 40_000n, "2026-04-05", { categoryId: "groceries" }),
  entry("rent-apr", "EXPENSE", 100_000n, "2026-04-03", { categoryId: "housing" }),
  entry("salary-jul", "INCOME", 300_000n, "2026-07-01", { categoryId: "salary" }),
  entry("rent-jul", "EXPENSE", 100_000n, "2026-07-03", { categoryId: "housing" }),
  entry("groceries-jul", "EXPENSE", 50_000n, "2026-07-05", { categoryId: "groceries" }),
  entry("stream-jul", "EXPENSE", 5_000n, "2026-07-07", { categoryId: "subscriptions" }),
  entry("transfer-jul", "TRANSFER", 40_000n, "2026-07-10", { transferAccountId: "savings" }),
  entry("salary-aug", "INCOME", 300_000n, "2026-08-01", { categoryId: "salary" }),
  entry("rent-aug", "EXPENSE", 100_000n, "2026-08-03", { categoryId: "housing" }),
  entry("groceries-aug", "EXPENSE", 60_000n, "2026-08-05", { categoryId: "groceries" }),
  entry("stream-aug", "EXPENSE", 5_000n, "2026-08-07", { categoryId: "subscriptions" }),
  entry("dining-aug", "EXPENSE", 30_000n, "2026-08-12", { categoryId: "dining" }),
  entry("dining-refund", "REFUND", 10_000n, "2026-08-20", { refundedTransactionId: "dining-aug" }),
  entry("salary-sep", "INCOME", 300_000n, "2026-09-01", { categoryId: "salary" }),
  entry("rent-sep", "EXPENSE", 100_000n, "2026-09-03", { categoryId: "housing" }),
  entry("rent-refund", "REFUND", 20_000n, "2026-09-12", { refundedTransactionId: "rent-sep" }),
  entry("groceries-sep", "EXPENSE", 70_000n, "2026-09-05", { categoryId: "groceries" }),
  entry("stream-sep", "EXPENSE", 5_000n, "2026-09-07", { categoryId: "subscriptions" }),
  entry("c0", "EXPENSE", 20_000n, "2026-09-08", { categoryId: "groceries" }),
  entry("c0-reversal", "EXPENSE", 20_000n, "2026-09-09", { categoryId: "groceries", reversalOfTransactionId: "c0" }),
  entry("pending-sep", "EXPENSE", 7_000n, "2026-09-06", { categoryId: "groceries", status: "PENDING" }),
  entry("future-sep", "EXPENSE", 9_000n, "2026-09-25", { categoryId: "groceries" }),
  entry("eur-sep", "EXPENSE", 5_000n, "2026-09-04", { categoryId: "groceries", currency: "EUR", accountId: "eur" }),
];

const recurringPayments: TrendsRecurringPayment[] = [
  { id: "rent", direction: "EXPENSE", status: "CONFIRMED", currency: "XAF", sampleTransactionIds: ["rent-apr", "rent-jul", "rent-aug", "rent-sep"] },
  { id: "stream", direction: "EXPENSE", status: "CANDIDATE", currency: "XAF", sampleTransactionIds: ["stream-jul", "stream-aug", "stream-sep"] },
  { id: "ignored", direction: "EXPENSE", status: "IGNORED", currency: "XAF", sampleTransactionIds: ["groceries-jul"] },
  { id: "salary", direction: "INCOME", status: "CONFIRMED", currency: "XAF", sampleTransactionIds: ["salary-jul", "salary-aug"] },
  { id: "eur-sub", direction: "EXPENSE", status: "CONFIRMED", currency: "EUR", sampleTransactionIds: ["eur-sep"] },
];

const accounts: AccountAnalysisAccount[] = [
  { id: "main", name: "Main", type: "CHECKING", currency: "XAF", archivedAt: null },
  { id: "savings", name: "Savings", type: "SAVINGS", currency: "XAF", archivedAt: null },
  { id: "eur", name: "Euro", type: "CHECKING", currency: "EUR", archivedAt: null },
];

function trends(overrides: Partial<BuildInsightsTrendsInput> = {}) {
  return buildInsightsTrends({
    transactions: ledger,
    accounts,
    recurringPayments,
    requestedCurrency: null,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    range: "3m",
    periodKey: undefined,
    now: midSeptember,
    resolveName: (_dimension, id) => names[id] ?? null,
    ...overrides,
  });
}

const sum = (values: readonly string[]) => values.reduce((total, value) => total + BigInt(value), 0n).toString();

test("3M, 6M and 12M horizons produce one bucket per month ending at the selected month", () => {
  const months = (range: "3m" | "6m" | "12m") => trends({ range }).months.map((month) => month.month);
  assert.deepEqual(months("3m"), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(months("6m"), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.equal(months("12m").length, 12);
  assert.equal(months("12m")[0], "2025-10");

  const six = trends({ range: "6m" });
  assert.equal(six.current.firstDate, "2026-04-01");
  assert.equal(six.current.lastDate, "2026-09-15");
  assert.equal(six.previous.firstDate, "2025-10-01");
  assert.equal(six.previous.isPartial, true);

  const august = trends({ periodKey: "2026-08" });
  assert.deepEqual(august.months.map((month) => month.month), ["2026-06", "2026-07", "2026-08"]);
  assert.equal(august.current.isPartial, false);

  assert.equal(parseTrendsRange(undefined), DEFAULT_TRENDS_RANGE);
  assert.equal(parseTrendsRange("1m"), "6m");
  assert.equal(parseTrendsRange(["12m"]), "12m");
  assert.equal(nextInsightsRange("12m", "ArrowRight", TRENDS_RANGES), "3m");
  assert.equal(nextInsightsRange("3m", "ArrowLeft", TRENDS_RANGES), "12m");
  assert.equal(nextInsightsRange("6m", "Home", TRENDS_RANGES), "3m");
});

test("monthly buckets add up exactly to the horizon totals and stop at today", () => {
  const result = trends();
  assert.deepEqual(
    result.months.map((month) => [month.month, month.incomeMinor, month.spendingMinor, month.netMinor, month.isPartial]),
    [
      ["2026-07", "300000", "155000", "145000", false],
      ["2026-08", "300000", "185000", "115000", false],
      ["2026-09", "300000", "155000", "145000", true],
    ],
  );
  assert.equal(sum(result.months.map((month) => month.spendingMinor)), result.totals.spending.minor);
  assert.equal(sum(result.months.map((month) => month.incomeMinor)), result.totals.income.minor);
  assert.equal(sum(result.months.map((month) => month.netMinor)), result.totals.net.minor);
  assert.equal(result.totals.spending.minor, "495000");
  assert.equal(result.totals.spending.previousMinor, "140000");
  assert.deepEqual(result.months.map((month) => month.transactionCount), [4, 6, 5]);

  const ahead = trends({ periodKey: "2026-11" });
  assert.deepEqual(ahead.months.map((month) => [month.month, month.isFuture]), [
    ["2026-09", false],
    ["2026-10", true],
    ["2026-11", true],
  ]);
  assert.equal(ahead.months[2]!.spendingMinor, "0");
  assert.deepEqual(cashFlowChartData(ahead.months, "XAF", "en-US").map((datum) => datum.spending), [155000, null, null]);
});

test("category trends follow the canonical monthly category totals", () => {
  const { categories } = trends();
  assert.deepEqual(
    categories.items.map((item) => [item.id, item.totalMinor, item.points.map((point) => point.spendingMinor)]),
    [
      ["housing", "280000", ["100000", "100000", "80000"]],
      ["groceries", "180000", ["50000", "60000", "70000"]],
      ["dining", "20000", ["0", "20000", "0"]],
      ["subscriptions", "15000", ["5000", "5000", "5000"]],
    ],
  );
  const groceries = categories.items[1]!;
  assert.deepEqual(groceries.points.map((point) => point.peakShareBps), [7142, 8571, 10000]);
  assert.equal(groceries.change.previousMinor, "40000");
  assert.equal(groceries.change.sentiment, "negative");
  assert.equal(groceries.shareBps, 3636);
  assert.equal(categories.otherCount, 0);
  for (const item of categories.items) {
    assert.equal(sum(item.points.map((point) => point.spendingMinor)), item.totalMinor);
  }

  const result = trends();
  assert.deepEqual(result.increases.map((change) => [change.id, change.deltaMinor, change.percentage]), [
    ["housing", "180000", "180"],
    ["groceries", "140000", "350"],
    ["dining", "20000", null],
  ]);
  assert.deepEqual(result.decreases, []);
});

test("transfers never count as workspace income or spending", () => {
  const withoutTransfer = trends({ transactions: ledger.filter((transaction) => transaction.kind !== "TRANSFER") });
  const result = trends();
  assert.deepEqual(result.totals, withoutTransfer.totals);
  assert.deepEqual(result.months, withoutTransfer.months);
  assert.equal(result.exclusions.transferCount, 1);
  assert.ok(!result.categories.items.some((item) => item.id === "__uncategorized__"));
  assert.ok(result.accounts.some((account) => account.id === "savings"));
});

test("refunds reduce the spending they belong to and corrections follow effective truth", () => {
  const result = trends();
  const august = result.months.find((month) => month.month === "2026-08")!;
  assert.equal(august.spendingMinor, "185000");
  assert.deepEqual(result.categories.items.find((item) => item.id === "dining")!.points.map((point) => point.spendingMinor), ["0", "20000", "0"]);
  const september = result.months.find((month) => month.month === "2026-09")!;
  assert.equal(september.spendingMinor, "155000");

  const corrected = trends({
    transactions: [
      ...ledger,
      entry("late-reversal", "EXPENSE", 50_000n, "2026-09-10", { categoryId: "groceries", reversalOfTransactionId: "groceries-jul" }),
    ],
  });
  assert.equal(corrected.months[0]!.spendingMinor, "105000");
  assert.equal(corrected.categories.items.find((item) => item.id === "groceries")!.points[0]!.spendingMinor, "0");
});

test("recurring spending counts only actual payments matched to confirmed recurring expenses", () => {
  const result = trends();
  assert.deepEqual(result.months.map((month) => month.recurringMinor), ["100000", "100000", "80000"]);
  assert.equal(result.totals.recurring.minor, "280000");
  assert.equal(result.totals.recurring.previousMinor, "100000");
  assert.equal(result.recurring.paymentCount, 1);
  assert.equal(result.recurring.shareBps, 5656);

  const reversed = trends({
    transactions: [...ledger, entry("rent-aug-reversal", "EXPENSE", 100_000n, "2026-08-04", { categoryId: "housing", reversalOfTransactionId: "rent-aug" })],
  });
  assert.equal(reversed.months[1]!.recurringMinor, "0");

  const projectionsOnly = trends({
    recurringPayments: [{ id: "new", direction: "EXPENSE", status: "CONFIRMED", currency: "XAF", sampleTransactionIds: [] }],
  });
  assert.deepEqual(projectionsOnly.months.map((month) => month.recurringMinor), ["0", "0", "0"]);
  assert.equal(projectionsOnly.recurring.paymentCount, 0);
});

test("each currency is reported on its own and never converted or combined", () => {
  const xaf = trends();
  assert.deepEqual(xaf.currencies.map((option) => option.code), ["XAF", "EUR"]);
  assert.equal(xaf.exclusions.otherCurrencyCount, 1);
  assert.ok(!xaf.accounts.some((account) => account.id === "eur"));

  const eur = trends({ requestedCurrency: "EUR" });
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.totals.spending.minor, "5000");
  assert.equal(eur.totals.income.minor, "0");
  assert.equal(eur.totals.recurring.minor, "5000");
  assert.deepEqual(eur.accounts.map((account) => account.id), ["eur"]);

  assert.equal(trends({ requestedCurrency: "USD" }).currency, "XAF");
});

test("deterministic signals flag spikes, rising categories, negative streaks and recurring increases", () => {
  const now = new Date("2026-10-02T09:00:00.000Z");
  const month = (key: string, beta: bigint, alpha: bigint) => [
    entry(`income-${key}`, "INCOME", 100_000n, `${key}-01`, { categoryId: "salary" }),
    entry(`b-${key}`, "EXPENSE", beta, `${key}-10`, { categoryId: "b" }),
    ...(alpha ? [entry(`a-${key}`, "EXPENSE", alpha, `${key}-12`, { categoryId: "a" })] : []),
  ];
  const result = trends({
    now,
    range: "6m",
    transactions: [
      entry("b-jan", "EXPENSE", 50_000n, "2026-01-10", { categoryId: "b" }),
      ...month("2026-05", 100_000n, 0n),
      ...month("2026-06", 100_000n, 0n),
      ...month("2026-07", 90_000n, 20_000n),
      ...month("2026-08", 90_000n, 30_000n),
      ...month("2026-09", 260_000n, 40_000n),
    ],
    recurringPayments: [{ id: "gym", direction: "EXPENSE", status: "CONFIRMED", currency: "XAF", sampleTransactionIds: ["b-jan", "b-2026-06"] }],
  });

  assert.deepEqual(result.signals, [
    { kind: "spendingSpike", month: "2026-09", spendingMinor: "300000", baselineMinor: "107500", percentage: "179" },
    { kind: "categoryRising", id: "a", name: "Alpha", isUncategorized: false, monthCount: 3, fromMinor: "20000", toMinor: "40000" },
    { kind: "netNegativeStreak", monthCount: 3, lastMonth: "2026-09", totalMinor: "-230000" },
    { kind: "recurringIncrease", deltaMinor: "50000", percentage: "100" },
  ]);
  const copy = result.signals.map((signal) => trendsSignalCopy(signal, result, labels, "home"));
  assert.equal(
    plain(copy[0]!.body),
    "Spending in September 2026 reached FCFA 300,000, 179% above the average of the other complete months (FCFA 107,500).",
  );
  assert.equal(copy[1]!.href, "/w/home/insights/categories/a?period=2026-10&range=6m");
  assert.equal(plain(copy[2]!.body), "Spending exceeded income for 3 months in a row through September 2026, FCFA 230,000 in total.");
  assert.equal(copy[3]!.href, "/w/home/recurring");

  const quiet = trends();
  assert.deepEqual(quiet.signals.map((signal) => signal.kind), ["recurringIncrease"]);
});

test("navigation preserves the horizon, period and currency across Trends and Category Detail", async () => {
  const state = trendsQueryState(trends({ range: "12m", requestedCurrency: "EUR", periodKey: "2026-08" }));
  assert.equal(insightsCategoryHref("home", "groceries", state), "/w/home/insights/categories/groceries?period=2026-08&range=12m&currency=EUR");
  assert.equal(insightsTrendsHref("home", state), "/w/home/insights/trends?period=2026-08&range=12m&currency=EUR");
  assert.equal(
    insightsSectionHref("home", "trends", "period=2026-08&range=3m&currency=EUR&page=2"),
    "/w/home/insights/trends?period=2026-08&range=3m&currency=EUR",
  );
  assert.equal(insightsSectionHref("home", "trends", "period=2026-08&range=1m"), "/w/home/insights/trends?period=2026-08");
  assert.equal(insightsSectionHref("home", "overview", "range=6m"), "/w/home/insights?range=6m");
  assert.equal(insightsSectionHref("home", "overview", ""), "/w/home/insights");

  const [evolution, changes, view, overviewView, accounts] = await Promise.all([
    readFile("src/modules/insights/ui/components/trends-category-evolution.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/trends-changes.tsx", "utf8"),
    readFile("src/modules/insights/ui/views/insights-trends-view.tsx", "utf8"),
    readFile("src/modules/insights/ui/views/insights-overview-view.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/insights-accounts.tsx", "utf8"),
  ]);
  assert.match(evolution, /insightsCategoryHref\(\s*workspaceSlug,\s*category\.id,\s*state/);
  assert.match(changes, /insightsCategoryHref\(\s*workspaceSlug,\s*item\.id,/);
  assert.match(view, /InsightsAccounts/);
  assert.match(accounts, /insightsAccountHref\(workspaceSlug, account\.id, state\)/);
  assert.match(view, /defaultRange=\{DEFAULT_TRENDS_RANGE\}/);
  assert.match(view, /ranges=\{TRENDS_RANGES\}/);
  assert.match(overviewView, /<InsightsSectionTabs/);
});

const actor: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };

function ledgerRecord(transaction: AccountLedgerEntry): LedgerTransactionRecord {
  return {
    ...transaction,
    reversalOfTransactionId: transaction.reversalOfTransactionId ?? null,
    workspaceId: "workspace",
    createdByUserId: actor.userId,
    paidByUserId: null,
    transferGroupId: null,
    source: { provider: "manual" },
    deduplicationFingerprint: null,
    note: null,
    createdAt: transaction.occurredAt,
    updatedAt: transaction.occurredAt,
  };
}

test("the query authorizes membership and excludes opening balances", async () => {
  const readers = {
    findMembership: async (workspaceId: string, userId: string) =>
      userId === actor.userId
        ? { workspaceId, userId, role: "MEMBER" as const, invitedByUserId: null, joinedAt: midSeptember, createdAt: midSeptember, updatedAt: midSeptember }
        : null,
    listTransactions: async () => [
      ledgerRecord(entry("sep", "EXPENSE", 30_000n, "2026-09-10", { categoryId: "groceries" })),
      { ...ledgerRecord(entry("opening", "INCOME", 1_000_000n, "2026-09-01")), kind: "OPENING_BALANCE" as const },
    ],
    listCategories: async () => [],
    listMerchants: async () => [],
    listAccounts: async () => [],
    listRecurringPayments: async () => [],
  };
  const input = {
    actor,
    workspaceId: "workspace",
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    labels,
    range: "3m" as const,
    periodKey: undefined,
    requestedCurrency: null,
    now: midSeptember,
  };
  const result = await getInsightsTrendsWithReaders(input, readers);
  assert.equal(result.totals.spending.minor, "30000");
  assert.equal(result.totals.income.minor, "0");
  await assert.rejects(
    getInsightsTrendsWithReaders({ ...input, actor: { ...actor, userId: "stranger" } }, readers),
    AuthorizationError,
  );
});

test("every Trends label exists in English, French, and German with the same placeholders", () => {
  const keys = (Object.keys(labels) as DashboardMessageKey[]).filter(
    (key) => key.startsWith("insights.trends.") || key.startsWith("insights.sections."),
  );
  assert.ok(keys.length >= 45);
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const language of ["en", "fr", "de"] as const) {
    const localized = getDashboardLabels(language);
    for (const key of keys) {
      assert.ok(localized[key]?.trim(), `${language} is missing ${key}`);
      assert.deepEqual(placeholders(localized[key]), placeholders(labels[key]), `${language} ${key}`);
    }
  }
  const result = trends();
  assert.equal(
    plain(cashFlowSummary({ ...result, locale: "fr-FR" }, getDashboardLabels("fr"))),
    "Sur 3 mois : revenus 900 000 FCFA, dépenses 495 000 FCFA, flux net 405 000 FCFA.",
  );
  assert.equal(getDashboardLabels("de")["insights.sections.trends"], "Trends");
  assert.equal(getDashboardLabels("fr")["insights.sections.trends"], "Tendances");
});

test("Trends stays responsive, has its own skeleton, and keeps money math out of React", async () => {
  const files = [
    "src/modules/insights/ui/views/insights-trends-view.tsx",
    "src/modules/insights/ui/components/trends-summary.tsx",
    "src/modules/insights/ui/components/trends-cash-flow-chart.tsx",
    "src/modules/insights/ui/components/trends-category-evolution.tsx",
    "src/modules/insights/ui/components/trends-changes.tsx",
    "src/modules/insights/ui/components/trends-recurring.tsx",
    "src/modules/insights/ui/components/trends-signals.tsx",
    "src/modules/insights/ui/components/insights-section-tabs.tsx",
    "src/app/w/[workspaceSlug]/insights/trends/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const [view, summary, chart] = sources;
  const loading = await readFile("src/app/w/[workspaceSlug]/insights/trends/loading.tsx", "utf8");

  assert.match(view!, /InsightsLoadingSurface/);
  assert.match(view!, /lg:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,1fr\)\]/);
  assert.match(summary!, /grid-cols-2[^"]*lg:grid-cols-4/);
  assert.match(chart!, /<table className="sr-only">/);
  assert.match(chart!, /isMobile/);
  assert.match(loading, /TrendsSkeleton/);
  assert.doesNotMatch(loading, /FilterLoadingSurface/);
  sources.forEach((source, index) => {
    assert.doesNotMatch(source, /BigInt\(|Number\(|\b\d+n\b/, files[index]);
  });
});
