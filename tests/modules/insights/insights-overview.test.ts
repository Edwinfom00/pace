import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import type { MoneyTransaction } from "@/money";
import type { InsightCandidate } from "@/money/insights";
import { presentDeterministicInsights } from "@/modules/insights/overview/insights-deterministic";
import {
  createNameResolver,
  getInsightsOverviewWithReaders,
  type InsightsOverviewReaders,
} from "@/modules/insights/overview/get-insights-overview";
import {
  buildInsightsOverview,
  insightsWindows,
  type BuildInsightsOverviewInput,
} from "@/modules/insights/overview/insights-overview";
import {
  parseInsightsCurrency,
  parseInsightsRange,
  type InsightsRange,
} from "@/modules/insights/overview/insights-overview.types";
import { insightsSearchQuery } from "@/modules/insights/ui/components/insights-navigation";
import { insightsNotes } from "@/modules/insights/ui/components/insights-right-rail";
import { nextInsightsRange } from "@/modules/insights/ui/components/insights-toolbar";
import {
  categoryBarWidth,
  formatComparisonPeriod,
  formatInsightsComparison,
  formatInsightsShare,
  incomeSpendingChartData,
  trendChartData,
  visibleTrendTickIndexes,
} from "@/modules/insights/ui/insights-format";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

const timeZone = "UTC";
const labels = getDashboardLabels("en");
const midSeptember = new Date("2026-09-15T12:00:00.000Z");

function entry(
  id: string,
  kind: MoneyTransaction["kind"],
  amountMinor: bigint,
  occurredOn: string,
  overrides: Partial<MoneyTransaction> = {},
): MoneyTransaction {
  return {
    id,
    kind,
    status: "POSTED",
    amountMinor,
    currency: "XAF",
    occurredAt: new Date(`${occurredOn}T12:00:00.000Z`),
    categoryId: kind === "TRANSFER" ? null : "groceries",
    merchantId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    ...overrides,
  };
}

const names: Record<string, string> = {
  groceries: "Groceries",
  dining: "Dining",
  transport: "Transport",
  market: "Market",
};

function overview(
  transactions: readonly MoneyTransaction[],
  overrides: Partial<BuildInsightsOverviewInput> = {},
) {
  return buildInsightsOverview({
    transactions,
    requestedCurrency: null,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    range: "1m",
    periodKey: undefined,
    now: midSeptember,
    resolveName: (_dimension, id) => names[id] ?? null,
    ...overrides,
  });
}

test("an in-progress month is compared day for day with the same elapsed days of the previous month", () => {
  const windows = insightsWindows(undefined, "1m", timeZone, midSeptember);

  assert.equal(windows.periodKey, "2026-09");
  assert.equal(windows.isPartial, true);
  assert.equal(windows.current.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(windows.current.end.toISOString(), "2026-09-16T00:00:00.000Z");
  assert.equal(windows.previous.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(windows.previous.end.toISOString(), "2026-08-16T00:00:00.000Z");

  const result = overview([
    entry("sep", "EXPENSE", 30_000n, "2026-09-10"),
    entry("aug-early", "EXPENSE", 20_000n, "2026-08-10"),
    entry("aug-late", "EXPENSE", 90_000n, "2026-08-25"),
  ]);
  assert.equal(result.kpis.spending.minor, "30000");
  assert.equal(result.kpis.spending.previousMinor, "20000");
  assert.equal(result.kpis.spending.direction, "up");
  assert.equal(result.kpis.spending.sentiment, "negative");
  assert.equal(result.kpis.spending.percentage, "50");
  assert.equal(result.previous.isPartial, true);
  assert.equal(result.previous.lastDate, "2026-08-15");
});

test("a completed month compares against the full previous month, clamping short months and year boundaries", () => {
  const march = insightsWindows("2026-03", "1m", timeZone, midSeptember);
  assert.equal(march.isPartial, false);
  assert.equal(march.previous.start.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(march.previous.end.toISOString(), "2026-03-01T00:00:00.000Z");

  const marchThirty = insightsWindows(undefined, "1m", timeZone, new Date("2026-03-30T08:00:00.000Z"));
  assert.equal(marchThirty.previous.end.toISOString(), "2026-03-01T00:00:00.000Z");

  const january = insightsWindows("2027-01", "1m", timeZone, new Date("2027-01-31T23:00:00.000Z"));
  assert.equal(january.previous.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(january.previous.end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("multi-month ranges compare against the preceding window of equal length in the workspace time zone", () => {
  const quarter = insightsWindows("2026-09", "3m", "Africa/Douala", midSeptember);
  assert.equal(quarter.current.start.toISOString(), "2026-06-30T23:00:00.000Z");
  assert.equal(quarter.previous.start.toISOString(), "2026-03-31T23:00:00.000Z");
  assert.equal(quarter.previous.end.toISOString(), "2026-06-16T23:00:00.000Z");

  const year = insightsWindows("2026-06", "12m", timeZone, midSeptember);
  assert.equal(year.current.start.toISOString(), "2025-07-01T00:00:00.000Z");
  assert.equal(year.current.end.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(year.previous.start.toISOString(), "2024-07-01T00:00:00.000Z");
  assert.equal(year.previous.end.toISOString(), "2025-07-01T00:00:00.000Z");
});

test("transfers are excluded, refunds reduce the original category, and pending entries are not actuals", () => {
  const result = overview([
    entry("expense", "EXPENSE", 100_000n, "2026-09-02", { categoryId: "dining" }),
    entry("refund", "REFUND", 40_000n, "2026-09-05", { categoryId: null, refundedTransactionId: "expense" }),
    entry("transfer", "TRANSFER", 500_000n, "2026-09-06"),
    entry("pending", "EXPENSE", 70_000n, "2026-09-07", { status: "PENDING" }),
    entry("salary", "INCOME", 300_000n, "2026-09-01", { categoryId: "salary" }),
  ]);

  assert.equal(result.kpis.spending.minor, "60000");
  assert.equal(result.kpis.income.minor, "300000");
  assert.equal(result.kpis.net.minor, "240000");
  assert.deepEqual(result.categories.items.map((item) => [item.id, item.spendingMinor]), [["dining", "60000"]]);
  assert.deepEqual(result.exclusions, { transferCount: 1, pendingCount: 1, otherCurrencyCount: 0 });
});

test("corrections follow effective truth even when the reversal is posted on a different day", () => {
  const result = overview([
    entry("original", "EXPENSE", 90_000n, "2026-09-03"),
    entry("reversal", "EXPENSE", 90_000n, "2026-09-12", { reversalOfTransactionId: "original" }),
    entry("replacement", "EXPENSE", 9_000n, "2026-09-03"),
    entry("refund-of-corrected", "REFUND", 1_000n, "2026-09-04", { categoryId: null, refundedTransactionId: "original" }),
  ]);

  assert.equal(result.kpis.spending.minor, "8000");
  const third = result.spendingTrend.points.find((point) => point.currentDate === "2026-09-03");
  assert.equal(third?.currentMinor, "9000");
  const twelfth = result.spendingTrend.points.find((point) => point.currentDate === "2026-09-12");
  assert.equal(twelfth?.currentMinor, "8000");
});

test("multiple currencies are reported one at a time and never aggregated", () => {
  const transactions = [
    entry("xaf", "EXPENSE", 50_000n, "2026-09-02"),
    entry("eur", "EXPENSE", 4_500n, "2026-09-03", { currency: "EUR" }),
    entry("eur-income", "INCOME", 200_000n, "2026-09-04", { currency: "EUR", categoryId: null }),
  ];

  const xaf = overview(transactions);
  assert.equal(xaf.currency, "XAF");
  assert.equal(xaf.kpis.spending.minor, "50000");
  assert.equal(xaf.kpis.income.minor, "0");
  assert.equal(xaf.exclusions.otherCurrencyCount, 2);
  assert.deepEqual(
    xaf.currencies.map((option) => [option.code, option.isWorkspaceCurrency, option.transactionCount]),
    [["XAF", true, 1], ["EUR", false, 2]],
  );

  const eur = overview(transactions, { requestedCurrency: "EUR" });
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.kpis.spending.minor, "4500");
  assert.equal(eur.kpis.income.minor, "200000");
  assert.equal(eur.exclusions.otherCurrencyCount, 1);

  assert.equal(overview(transactions, { requestedCurrency: "USD" }).currency, "XAF");
  assert.equal(parseInsightsCurrency("eur"), null);
  assert.equal(parseInsightsCurrency(["EUR", "USD"]), "EUR");
});

test("the income vs spending series covers at least six months and marks the selected window", () => {
  const result = overview([
    entry("sep", "EXPENSE", 10_000n, "2026-09-02"),
    entry("jul", "INCOME", 80_000n, "2026-07-10", { categoryId: null }),
  ], { range: "3m" });

  assert.deepEqual(result.incomeVsSpending.map((bar) => bar.month), [
    "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  ]);
  assert.deepEqual(result.incomeVsSpending.map((bar) => bar.isSelected), [false, false, false, true, true, true]);
  assert.equal(result.incomeVsSpending.at(-1)?.isPartial, true);
  assert.equal(overview([], { range: "12m" }).incomeVsSpending.length, 12);

  const chart = incomeSpendingChartData(result.incomeVsSpending, "XAF", "en-US");
  assert.equal(chart[3]?.income, 80_000);
  assert.equal(chart[3]?.incomeMinor, "80000");
  assert.equal(chart[5]?.label, "Sep");
});

test("the spending trend keeps every day, stops actuals after today, and keeps the previous period line", () => {
  const result = overview([
    entry("one", "EXPENSE", 2_000n, "2026-09-01"),
    entry("previous", "EXPENSE", 5_000n, "2026-08-31"),
  ]);
  const points = result.spendingTrend.points;

  assert.equal(points.length, 31);
  assert.equal(points[0]?.currentMinor, "2000");
  assert.equal(points[14]?.currentDate, "2026-09-15");
  assert.equal(points[14]?.currentMinor, "2000");
  assert.equal(points[15]?.currentMinor, null);
  assert.equal(points[29]?.currentDate, "2026-09-30");
  assert.equal(points[30]?.currentDate, null);
  assert.equal(points[30]?.previousMinor, "5000");
  assert.equal(result.spendingTrend.hasSpending, true);

  const chart = trendChartData(points, "EUR");
  assert.equal(chart[0]?.current, 20);
  assert.equal(chart[15]?.current, null);
});

test("category breakdown shares are bigint derived, sum to the total, and group the long tail", () => {
  const categories = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const result = overview(
    categories.map((id, index) => entry(id, "EXPENSE", BigInt((index + 1) * 1_000), "2026-09-03", { categoryId: id })),
    { resolveName: (_dimension, id) => id.toUpperCase() },
  );

  assert.equal(result.categories.totalMinor, "36000");
  assert.deepEqual(result.categories.items.map((item) => item.id), ["h", "g", "f", "e", "d", "c"]);
  assert.equal(result.categories.items[0]?.shareBps, 2222);
  assert.deepEqual(result.categories.other, { spendingMinor: "3000", shareBps: 833, categoryCount: 2 });
  assert.equal(categoryBarWidth(2222), "22.22%");
  assert.equal(categoryBarWidth(1), "2%");
  assert.equal(formatInsightsShare(2222, "en-US"), "22%");
  assert.equal(formatInsightsShare(50, "en-US"), "0.5%");
});

test("top changes rank category and merchant deltas by magnitude and skip unknown merchants", () => {
  const result = overview([
    entry("dining-now", "EXPENSE", 90_000n, "2026-09-03", { categoryId: "dining", merchantId: "market" }),
    entry("dining-before", "EXPENSE", 30_000n, "2026-08-03", { categoryId: "dining", merchantId: "market" }),
    entry("transport-before", "EXPENSE", 20_000n, "2026-08-04", { categoryId: "transport" }),
    entry("groceries-now", "EXPENSE", 5_000n, "2026-09-04"),
  ]);

  assert.deepEqual(
    result.topChanges.map((change) => [change.dimension, change.id, change.deltaMinor, change.percentage]),
    [
      ["category", "dining", "60000", "200"],
      ["merchant", "market", "60000", "200"],
      ["category", "transport", "-20000", "100"],
      ["category", "groceries", "5000", null],
    ],
  );
});

test("an empty ledger produces honest empty states instead of zero-filled insight", () => {
  const result = overview([]);

  assert.equal(result.hasActivity, false);
  assert.equal(result.spendingTrend.hasSpending, false);
  assert.deepEqual(result.categories.items, []);
  assert.equal(result.categories.other, null);
  assert.deepEqual(result.topChanges, []);
  assert.equal(result.kpis.spending.percentage, null);
  assert.equal(formatInsightsComparison(result.kpis.spending, labels).text, "Unchanged");
  assert.equal(
    formatInsightsComparison({ ...result.kpis.spending, direction: "up", percentage: null }, labels).text,
    "No comparable data",
  );
});

const actor: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };

function ledgerRecord(transaction: MoneyTransaction): LedgerTransactionRecord {
  return {
    ...transaction,
    reversalOfTransactionId: transaction.reversalOfTransactionId ?? null,
    workspaceId: "workspace",
    accountId: "account",
    transferAccountId: null,
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

function readers(overrides: Partial<InsightsOverviewReaders> = {}): InsightsOverviewReaders {
  return {
    findMembership: async (workspaceId, userId) =>
      userId === actor.userId
        ? { workspaceId, userId, role: "MEMBER", invitedByUserId: null, joinedAt: midSeptember, createdAt: midSeptember, updatedAt: midSeptember }
        : null,
    listTransactions: async () => [
      ledgerRecord(entry("sep", "EXPENSE", 30_000n, "2026-09-10", { categoryId: "food" })),
      { ...ledgerRecord(entry("opening", "INCOME", 1_000_000n, "2026-09-01")), kind: "OPENING_BALANCE" },
    ],
    listCategories: async () => [{
      id: "food",
      workspaceId: null,
      name: "Food",
      kind: "EXPENSE",
      isSystem: true,
      systemKey: null,
      createdByUserId: null,
      createdAt: midSeptember,
      updatedAt: midSeptember,
    }],
    listMerchants: async () => [],
    previewInsights: async () => [],
    ...overrides,
  };
}

function query(range: InsightsRange = "1m") {
  return {
    actor,
    workspaceId: "workspace",
    workspaceSlug: "home",
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    labels,
    range,
    periodKey: undefined,
    requestedCurrency: null,
    now: midSeptember,
  };
}

test("the query authorizes membership, excludes opening balances, and degrades insights independently", async () => {
  const result = await getInsightsOverviewWithReaders(query(), readers({
    previewInsights: async () => {
      throw new Error("insight store unavailable");
    },
  }));

  assert.equal(result.overview.kpis.income.minor, "0");
  assert.equal(result.overview.categories.items[0]?.name, "Food");
  assert.deepEqual(result.insights, { month: "2026-09", unavailable: true, items: [] });

  await assert.rejects(
    getInsightsOverviewWithReaders({ ...query(), actor: { ...actor, userId: "stranger" } }, readers()),
    AuthorizationError,
  );
});

test("deterministic insights come from the canonical M6 candidates for the selected month and currency", async () => {
  const requests: Array<{ asOf: string; currency: string }> = [];
  const candidate: InsightCandidate = {
    type: "CATEGORY_SPIKE",
    severity: "WARNING",
    data: { categoryId: "food", changeMinor: "15000", currency: "XAF" },
    period: { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") },
    source: "MONEY_ENGINE",
    fingerprint: "spike",
    expiresAt: null,
  };
  const result = await getInsightsOverviewWithReaders(
    { ...query(), periodKey: "2026-08" },
    readers({
      previewInsights: async (_actor, _workspace, input) => {
        requests.push({ asOf: input.asOf.toISOString(), currency: input.currency });
        return [candidate];
      },
    }),
  );

  assert.deepEqual(requests, [{ asOf: "2026-08-31T23:59:59.999Z", currency: "XAF" }]);
  assert.equal(result.insights.items[0]?.title, "Category spending increased");
  assert.equal(result.insights.items[0]?.subject, "Food");
  assert.equal(result.insights.items[0]?.tone, "attention");
  assert.match(result.insights.items[0]?.description ?? "", /15,000/);
  assert.equal(
    result.insights.items[0]?.href,
    "/w/home/transactions?category=food&from=2026-08-01&to=2026-08-31",
  );

  const future = await getInsightsOverviewWithReaders({ ...query(), periodKey: "2027-01" }, readers({
    previewInsights: async () => assert.fail("future months have no observations"),
  }));
  assert.deepEqual(future.insights.items, []);
});

test("insight presentation is ordered by priority and capped", () => {
  const base = { period: { start: midSeptember, end: midSeptember }, source: "MONEY_ENGINE" as const, expiresAt: null, data: { currency: "XAF" } };
  const items = presentDeterministicInsights({
    candidates: [
      { ...base, type: "CATEGORY_DROP", severity: "INFO", fingerprint: "a" },
      { ...base, type: "BUDGET_EXCEEDED", severity: "CRITICAL", fingerprint: "b", data: { budgetId: "budget", currency: "XAF" } },
      { ...base, type: "GOAL_ON_TRACK", severity: "INFO", fingerprint: "c" },
    ],
    labels,
    locale: "en-US",
    timeZone,
    workspaceSlug: "home",
    resolveName: () => null,
    limit: 2,
  });

  assert.deepEqual(items.map((item) => item.type), ["BUDGET_EXCEEDED", "CATEGORY_DROP"]);
  assert.equal(items[0]?.href, "/w/home/plans/budgets/budget");
});

test("category names are localized and uncategorized spending is labelled", () => {
  const resolve = createNameResolver(
    getDashboardLabels("fr"),
    [{ id: "custom", name: "Mon budget", systemKey: null }],
    [{ id: "merchant", name: "Carrefour" }],
  );
  assert.equal(resolve("category", "__uncategorized__"), "Non catégorisé");
  assert.equal(resolve("category", "custom"), "Mon budget");
  assert.equal(resolve("merchant", "merchant"), "Carrefour");
  assert.equal(resolve("merchant", "__unknown_merchant__"), null);
});

test("URL state is stable and the range control supports keyboard selection", () => {
  assert.equal(parseInsightsRange("6m"), "6m");
  assert.equal(parseInsightsRange("2y"), "1m");
  assert.equal(insightsSearchQuery("period=2026-08&range=3m", { range: null, currency: "EUR" }), "period=2026-08&currency=EUR");
  assert.equal(nextInsightsRange("1m", "ArrowRight"), "3m");
  assert.equal(nextInsightsRange("1m", "ArrowLeft"), "12m");
  assert.equal(nextInsightsRange("6m", "End"), "12m");
  assert.equal(nextInsightsRange("6m", "Enter"), null);
});

test("every Insights label exists in English, French, and German with the same placeholders", () => {
  const languages = ["en", "fr", "de"] as const;
  const insightKeys = (Object.keys(labels) as DashboardMessageKey[]).filter((key) =>
    /^insights\.(page|period|range|comparison|currency|loading|kpi|incomeVsSpending|trend|categories|changes|rail|empty|error|type)/.test(key),
  );
  assert.ok(insightKeys.length >= 50);
  for (const language of languages) {
    const localized = getDashboardLabels(language);
    for (const key of insightKeys) {
      assert.ok(localized[key]?.trim(), `${language} is missing ${key}`);
      const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      assert.deepEqual(placeholders(localized[key]), placeholders(labels[key]), `${language} ${key}`);
    }
  }
  assert.equal(getDashboardLabels("fr")["insights.page.title"], "Analyses");
  assert.equal(getDashboardLabels("de")["insights.trend.title"], "Ausgabentrend");
  assert.equal(getDashboardLabels("de")["insights.type.BUDGET_EXCEEDED"], "Budget überschritten");
  assert.equal(
    formatComparisonPeriod({ firstDate: "2026-08-01", lastDate: "2026-08-15", isPartial: true }, getDashboardLabels("de"), "de-DE"),
    "Tag für Tag verglichen mit 1.–15. Aug. 2026",
  );
});

test("notes explain exclusions and only mention currencies when more than one exists", () => {
  const single = overview([entry("transfer", "TRANSFER", 1_000n, "2026-09-02")]);
  const notes = insightsNotes(single, labels);
  assert.ok(notes.some((note) => note.includes("Transfers between your accounts are excluded (1 this period)")));
  assert.ok(notes.some((note) => note.includes("projections")));
  assert.ok(!notes.some((note) => note.includes("other currencies")));

  const mixed = overview([entry("eur", "EXPENSE", 1_000n, "2026-09-02", { currency: "EUR" })]);
  assert.ok(insightsNotes(mixed, labels).some((note) => note.includes("Amounts are in XAF only. 1 transactions")));
});

test("mobile layouts reduce chart ticks, stack the rail, and keep the loading surface for refreshes only", async () => {
  const desktop = visibleTrendTickIndexes(31, false);
  const mobile = visibleTrendTickIndexes(31, true);
  assert.ok(mobile.size < desktop.size);
  assert.ok(mobile.has(0) && mobile.has(30));
  assert.equal(visibleTrendTickIndexes(0, true).size, 0);

  const [view, kpis, page, loading] = await Promise.all([
    readFile("src/modules/insights/ui/views/insights-overview-view.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/insights-kpis.tsx", "utf8"),
    readFile("src/app/w/[workspaceSlug]/insights/page.tsx", "utf8"),
    readFile("src/app/w/[workspaceSlug]/insights/loading.tsx", "utf8"),
  ]);
  assert.match(view, /xl:grid-cols-\[minmax\(0,1fr\)_/);
  assert.match(view, /InsightsLoadingSurface/);
  assert.match(kpis, /grid-cols-2[^"]*lg:grid-cols-4/);
  assert.match(loading, /InsightsSkeleton/);
  assert.doesNotMatch(loading, /FilterLoadingSurface/);
  assert.doesNotMatch(page, /BigInt|Number\(/);
});
