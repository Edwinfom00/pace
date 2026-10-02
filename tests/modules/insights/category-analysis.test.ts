import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import type { MoneyTransaction } from "@/money";
import {
  buildCategoryAnalysis,
  weeklySpending,
  type BuildCategoryAnalysisInput,
  type CategoryAnalysisScope,
} from "@/modules/insights/category/category-analysis";
import {
  categoryScope,
  getCategoryAnalysisWithReaders,
  type CategoryAnalysisReaders,
} from "@/modules/insights/category/get-category-analysis";
import {
  categoryAnalysisNotes,
  categoryInsightCopy,
  categoryTransactionsHref,
} from "@/modules/insights/ui/category-analysis-format";
import { insightsCategoryHref, insightsOverviewHref } from "@/modules/insights/ui/insights-links";
import type { LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { createPeriod } from "@/money/period";

const timeZone = "UTC";
const labels = getDashboardLabels("en");
const midSeptember = new Date("2026-09-15T12:00:00.000Z");
const plain = (value: string) => value.replace(/[   ]/g, " ");

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
    categoryId: null,
    merchantId: null,
    refundedTransactionId: null,
    reversalOfTransactionId: null,
    ...overrides,
  };
}

const names: Record<string, string> = {
  food: "Food",
  groceries: "Groceries",
  dining: "Dining",
  transport: "Transport",
  "m-market": "Market",
  "m-bistro": "Bistro",
};

const food: CategoryAnalysisScope = {
  id: "food",
  name: "Food",
  parent: null,
  children: [
    { id: "dining", name: "Dining" },
    { id: "groceries", name: "Groceries" },
  ],
};
const dining: CategoryAnalysisScope = {
  id: "dining",
  name: "Dining",
  parent: { id: "food", name: "Food" },
  children: [],
};

const ledger: MoneyTransaction[] = [
  entry("e1", "EXPENSE", 10_000n, "2026-09-02", { categoryId: "groceries", merchantId: "m-market" }),
  entry("e2", "EXPENSE", 30_000n, "2026-09-08", { categoryId: "dining", merchantId: "m-bistro" }),
  entry("e3", "EXPENSE", 5_000n, "2026-09-09", { categoryId: "food" }),
  entry("r1", "REFUND", 4_000n, "2026-09-10", { refundedTransactionId: "e2" }),
  entry("c0", "EXPENSE", 20_000n, "2026-09-12", { categoryId: "groceries", merchantId: "m-market" }),
  entry("c0-reversal", "EXPENSE", 20_000n, "2026-09-14", { categoryId: "groceries", reversalOfTransactionId: "c0" }),
  entry("c1", "EXPENSE", 20_000n, "2026-09-12", { categoryId: "transport" }),
  entry("t1", "TRANSFER", 50_000n, "2026-09-05", { categoryId: "groceries" }),
  entry("p1", "EXPENSE", 7_000n, "2026-09-11", { categoryId: "groceries", status: "PENDING" }),
  entry("x1", "EXPENSE", 9_000n, "2026-09-03", { categoryId: "transport" }),
  entry("eur", "EXPENSE", 2_000n, "2026-09-04", { categoryId: "groceries", currency: "EUR" }),
  entry("salary", "INCOME", 300_000n, "2026-09-01", { categoryId: "salary" }),
  entry("a1", "EXPENSE", 8_000n, "2026-08-03", { categoryId: "groceries", merchantId: "m-market" }),
  entry("a2", "EXPENSE", 12_000n, "2026-08-05", { categoryId: "dining", merchantId: "m-bistro" }),
  entry("a3", "EXPENSE", 50_000n, "2026-08-25", { categoryId: "dining" }),
];

function analyze(category: CategoryAnalysisScope = food, overrides: Partial<BuildCategoryAnalysisInput> = {}) {
  return buildCategoryAnalysis({
    transactions: ledger,
    category,
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

test("a root category rolls up its subcategories and excludes unrelated categories", () => {
  const result = analyze();

  assert.equal(result.kpis.spent.minor, "41000");
  assert.equal(result.kpis.spent.previousMinor, "20000");
  assert.deepEqual(result.kpis.transactionCount, { current: 3, previous: 2 });
  assert.equal(result.kpis.averageTransaction.minor, "13667");
  assert.equal(result.kpis.averageTransaction.previousMinor, "10000");
  assert.equal(result.shareOfSpendingBps, 5857);
  assert.equal(result.category.childCount, 2);
  assert.ok(!result.transactions.items.some((item) => item.id === "x1" || item.id === "c1"));
});

test("a child category is analysed on its own and links back to its parent", () => {
  const result = analyze(dining);

  assert.equal(result.kpis.spent.minor, "26000");
  assert.equal(result.kpis.spent.previousMinor, "12000");
  assert.equal(result.subcategories, null);
  assert.deepEqual(result.category.parent, { id: "food", name: "Food" });
  assert.equal(result.category.childCount, 0);
  assert.deepEqual(result.transactions.items.map((item) => item.id), ["r1", "e2"]);
});

test("the subcategory breakdown follows the canonical hierarchy, including direct spending on the parent", () => {
  const rows = analyze().subcategories!;

  assert.deepEqual(
    rows.map((row) => [row.id, row.isDirect, row.currentMinor, row.previousMinor, row.deltaMinor, row.direction, row.percentage, row.shareBps]),
    [
      ["dining", false, "26000", "12000", "14000", "up", "117", 6341],
      ["groceries", false, "10000", "8000", "2000", "up", "25", 2439],
      ["food", true, "5000", "0", "5000", "up", null, 1219],
    ],
  );

  const categories: LedgerCategoryRecord[] = [
    category("food", null),
    category("groceries", "food"),
    category("dining", "food"),
    category("salary", null, "INCOME"),
  ];
  assert.deepEqual(categoryScope("food", categories, labels), {
    id: "food",
    name: "Food",
    parent: null,
    children: [{ id: "dining", name: "Dining" }, { id: "groceries", name: "Groceries" }],
  });
  assert.deepEqual(categoryScope("dining", categories, labels), {
    id: "dining",
    name: "Dining",
    parent: { id: "food", name: "Food" },
    children: [],
  });
  assert.equal(categoryScope("salary", categories, labels), null);
  assert.equal(categoryScope("missing", categories, labels), null);
});

test("period comparison is day for day for an in-progress month and widens with the range", () => {
  const month = analyze();
  assert.equal(month.periodKey, "2026-09");
  assert.equal(month.current.firstDate, "2026-09-01");
  assert.equal(month.current.lastDate, "2026-09-15");
  assert.equal(month.previous.lastDate, "2026-08-15");
  assert.equal(month.previous.isPartial, true);
  assert.equal(month.kpis.spent.deltaMinor, "21000");
  assert.equal(month.kpis.spent.percentage, "105");
  assert.equal(month.kpis.spent.sentiment, "negative");

  const quarter = analyze(food, { range: "3m" });
  assert.equal(quarter.current.firstDate, "2026-07-01");
  assert.equal(quarter.kpis.spent.minor, "111000");

  const august = analyze(food, { periodKey: "2026-08" });
  assert.equal(august.current.isPartial, false);
  assert.equal(august.kpis.spent.minor, "70000");
  assert.equal(august.previous.firstDate, "2026-07-01");
  assert.equal(august.previous.lastDate, "2026-07-31");
});

test("refunds reduce the category of the refunded expense and corrections follow effective truth", () => {
  const result = analyze();
  const refund = result.transactions.items.find((item) => item.id === "r1");
  assert.deepEqual(refund, {
    id: "r1",
    kind: "REFUND",
    date: "2026-09-10",
    signedMinor: "-4000",
    merchantName: "Bistro",
    categoryId: "dining",
    categoryName: "Dining",
  });
  assert.equal(result.transactions.refundCount, 1);
  assert.ok(!result.transactions.items.some((item) => item.id.startsWith("c0")));
  assert.equal(result.merchants.items.find((item) => item.id === "m-bistro")?.currentMinor, "26000");

  const fourteenth = result.spendingTrend.points.find((point) => point.currentDate === "2026-09-14");
  assert.equal(fourteenth?.currentMinor, "41000");
  const twelfth = result.spendingTrend.points.find((point) => point.currentDate === "2026-09-12");
  assert.equal(twelfth?.currentMinor, "41000");

  const transport = analyze({ id: "transport", name: "Transport", parent: null, children: [] });
  assert.equal(transport.kpis.spent.minor, "29000");
});

test("transfers and pending entries are never counted as category spending", () => {
  const result = analyze();
  assert.deepEqual(result.exclusions, { transferCount: 1, pendingCount: 1, otherCurrencyCount: 1 });
  assert.ok(!result.transactions.items.some((item) => item.id === "t1" || item.id === "p1"));
  assert.ok(categoryAnalysisNotes(result, labels).some((note) => note.includes("Transfers are never counted as category spending (1 this period)")));
  assert.ok(categoryAnalysisNotes(result, labels).some((note) => note.includes("projections")));
});

test("each currency is analysed on its own and never converted or combined", () => {
  const xaf = analyze();
  assert.equal(xaf.currency, "XAF");
  assert.deepEqual(
    xaf.currencies.map((option) => [option.code, option.isWorkspaceCurrency, option.transactionCount]),
    [["XAF", true, 4], ["EUR", false, 1]],
  );

  const eur = analyze(food, { requestedCurrency: "EUR" });
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.kpis.spent.minor, "2000");
  assert.equal(eur.exclusions.otherCurrencyCount, 4);
  assert.deepEqual(eur.transactions.items.map((item) => item.id), ["eur"]);

  assert.equal(analyze(food, { requestedCurrency: "USD" }).currency, "XAF");
  assert.ok(categoryAnalysisNotes(xaf, labels).some((note) => note.includes("Amounts are in XAF only. 1 transactions")));
});

test("contributing transactions are newest first and link to canonical Transaction Detail", () => {
  const result = analyze();
  assert.deepEqual(result.transactions.items.map((item) => item.id), ["r1", "e3", "e2", "e1"]);
  assert.equal(result.transactions.totalCount, 4);
  assert.equal(result.transactions.items.find((item) => item.id === "e3")?.categoryName, null);

  const largest = result.insights.find((insight) => insight.kind === "largestTransaction")!;
  assert.equal(categoryInsightCopy(largest, result, labels, "home").href, "/w/home/transactions/e2");

  assert.equal(categoryTransactionsHref(result, "home"), null);
  assert.equal(
    categoryTransactionsHref(analyze(dining), "home"),
    "/w/home/transactions?category=dining&from=2026-09-01&to=2026-09-15",
  );
});

test("navigation preserves the period, range and currency between Insights and Category Detail", async () => {
  const state = { periodKey: "2026-08", range: "3m" as const, currency: "EUR", workspaceCurrency: "XAF" };
  assert.equal(insightsCategoryHref("home", "dining", state), "/w/home/insights/categories/dining?period=2026-08&range=3m&currency=EUR");
  assert.equal(insightsOverviewHref("home", state), "/w/home/insights?period=2026-08&range=3m&currency=EUR");
  assert.equal(
    insightsCategoryHref("home", "food", { ...state, range: "1m", currency: "XAF" }),
    "/w/home/insights/categories/food?period=2026-08",
  );

  const subcategoryIncrease = categoryInsightCopy(
    { kind: "biggestIncrease", dimension: "subcategory", id: "dining", name: "Dining", deltaMinor: "14000", percentage: "117" },
    analyze(),
    labels,
    "home",
  );
  assert.equal(subcategoryIncrease.href, "/w/home/insights/categories/dining?period=2026-09");

  const [breakdown, header, rail] = await Promise.all([
    readFile("src/modules/insights/ui/components/insights-category-breakdown.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/category-analysis-header.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/category-analysis-breakdown.tsx", "utf8"),
  ]);
  assert.match(breakdown, /insightsCategoryHref\(workspaceSlug, category\.id/);
  assert.match(header, /insightsOverviewHref\(workspaceSlug, state\)/);
  assert.match(rail, /insightsCategoryHref\(workspaceSlug, item\.id, state\)/);
});

test("deterministic insights cover biggest increase, merchant concentration, strongest week and largest transaction", () => {
  const result = analyze();
  assert.deepEqual(result.insights, [
    { kind: "biggestIncrease", dimension: "merchant", id: "m-bistro", name: "Bistro", deltaMinor: "14000", percentage: "117" },
    { kind: "merchantConcentration", id: "m-bistro", name: "Bistro", shareBps: 6341 },
    { kind: "strongestWeek", firstDate: "2026-09-07", lastDate: "2026-09-13", spendingMinor: "31000", shareBps: 7560 },
    { kind: "largestTransaction", transactionId: "e2", date: "2026-09-08", amountMinor: "30000", merchantName: "Bistro" },
  ]);

  const copy = result.insights.map((insight) => plain(categoryInsightCopy(insight, result, labels, "home").body));
  assert.deepEqual(copy, [
    "Bistro is up FCFA 14,000 (117%) compared with the previous period.",
    "Bistro accounts for 63% of spending in this category.",
    "Sep 7 – 13, 2026: FCFA 31,000, 76% of this period’s spending.",
    "FCFA 30,000 at Bistro on Sep 8.",
  ]);

  const weeks = weeklySpending(
    ledger.filter((transaction) => transaction.id === "e1"),
    createPeriod(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-10-01T00:00:00.000Z")),
    timeZone,
    "XAF",
  );
  assert.deepEqual(weeks.map((week) => [week.firstDate, week.lastDate]), [
    ["2026-09-01", "2026-09-06"],
    ["2026-09-07", "2026-09-13"],
    ["2026-09-14", "2026-09-20"],
    ["2026-09-21", "2026-09-27"],
    ["2026-09-28", "2026-09-30"],
  ]);
  assert.equal(weeks[0]?.spendingMinor, 10_000n);
});

test("an empty category produces an honest empty state", () => {
  const result = analyze({ id: "health", name: "Health", parent: null, children: [] });
  assert.equal(result.hasActivity, false);
  assert.equal(result.kpis.spent.minor, "0");
  assert.equal(result.kpis.averageTransaction.minor, "0");
  assert.deepEqual(result.insights, []);
  assert.deepEqual(result.merchants, { items: [], other: null });
});

const actor: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };

function category(id: string, parentCategoryId: string | null, kind: "EXPENSE" | "INCOME" = "EXPENSE"): LedgerCategoryRecord {
  return {
    id,
    workspaceId: null,
    parentCategoryId,
    name: names[id] ?? id[0]!.toUpperCase() + id.slice(1),
    kind,
    isSystem: true,
    systemKey: null,
    createdByUserId: null,
    createdAt: midSeptember,
    updatedAt: midSeptember,
  };
}

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

function readers(): CategoryAnalysisReaders {
  return {
    findMembership: async (workspaceId, userId) =>
      userId === actor.userId
        ? { workspaceId, userId, role: "MEMBER", invitedByUserId: null, joinedAt: midSeptember, createdAt: midSeptember, updatedAt: midSeptember }
        : null,
    listTransactions: async () => [
      ledgerRecord(entry("sep", "EXPENSE", 30_000n, "2026-09-10", { categoryId: "dining", merchantId: "m-bistro" })),
      { ...ledgerRecord(entry("opening", "INCOME", 1_000_000n, "2026-09-01", { categoryId: "food" })), kind: "OPENING_BALANCE" },
    ],
    listCategories: async () => [category("food", null), category("dining", "food"), category("salary", null, "INCOME")],
    listMerchants: async () => [{
      id: "m-bistro",
      workspaceId: "workspace",
      name: "Bistro",
      normalizedName: "bistro",
      createdByUserId: actor.userId,
      createdAt: midSeptember,
      updatedAt: midSeptember,
    }],
  };
}

function query(categoryId: string) {
  return {
    actor,
    workspaceId: "workspace",
    categoryId,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    labels,
    range: "1m" as const,
    periodKey: undefined,
    requestedCurrency: null,
    now: midSeptember,
  };
}

test("the query authorizes membership, resolves the hierarchy, and excludes opening balances", async () => {
  const result = await getCategoryAnalysisWithReaders(query("food"), readers());
  assert.equal(result?.kpis.spent.minor, "30000");
  assert.equal(result?.merchants.items[0]?.name, "Bistro");
  assert.equal(result?.subcategories?.[0]?.name, "Dining");

  assert.equal(await getCategoryAnalysisWithReaders(query("unknown"), readers()), null);
  assert.equal(await getCategoryAnalysisWithReaders(query("salary"), readers()), null);
  await assert.rejects(
    getCategoryAnalysisWithReaders({ ...query("food"), actor: { ...actor, userId: "stranger" } }, readers()),
    AuthorizationError,
  );
});

test("every Category Detail label exists in English, French, and German with the same placeholders", () => {
  const keys = (Object.keys(labels) as DashboardMessageKey[]).filter((key) => key.startsWith("insights.category."));
  assert.ok(keys.length >= 50);
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const language of ["en", "fr", "de"] as const) {
    const localized = getDashboardLabels(language);
    for (const key of keys) {
      assert.ok(localized[key]?.trim(), `${language} is missing ${key}`);
      assert.deepEqual(placeholders(localized[key]), placeholders(labels[key]), `${language} ${key}`);
    }
  }

  const result = analyze();
  const fr = getDashboardLabels("fr");
  assert.equal(fr["insights.category.transactions.title"], "Transactions concernées");
  assert.equal(
    plain(categoryInsightCopy(result.insights[1]!, { ...result, locale: "fr-FR" }, fr, "home").body),
    "Bistro représente 63 % des dépenses de cette catégorie.",
  );
  assert.equal(getDashboardLabels("de")["insights.category.kpi.average"], "Durchschnittliche Buchung");
});

test("mobile layout stacks the rail, keeps a dedicated skeleton, and leaves money math out of React", async () => {
  const files = [
    "src/modules/insights/ui/views/category-analysis-view.tsx",
    "src/modules/insights/ui/components/category-analysis-kpis.tsx",
    "src/modules/insights/ui/components/category-analysis-breakdown.tsx",
    "src/modules/insights/ui/components/category-analysis-transactions.tsx",
    "src/modules/insights/ui/components/category-analysis-insights.tsx",
    "src/modules/insights/ui/components/category-analysis-right-rail.tsx",
    "src/modules/insights/ui/components/category-analysis-header.tsx",
    "src/app/w/[workspaceSlug]/insights/categories/[categoryId]/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const [view, kpis] = sources;
  const loading = await readFile("src/app/w/[workspaceSlug]/insights/categories/[categoryId]/loading.tsx", "utf8");

  assert.match(view!, /xl:grid-cols-\[minmax\(0,1fr\)_/);
  assert.match(view!, /InsightsLoadingSurface/);
  assert.match(kpis!, /grid-cols-2[^"]*lg:grid-cols-3/);
  assert.match(loading, /CategoryAnalysisSkeleton/);
  assert.doesNotMatch(loading, /FilterLoadingSurface/);
  sources.forEach((source, index) => {
    assert.doesNotMatch(source, /BigInt\(|Number\(|\b\d+n\b/, files[index]);
  });
});
