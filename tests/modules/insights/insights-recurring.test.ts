import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import type { MoneyTransaction } from "@/money";
import { getInsightsRecurringWithReaders } from "@/modules/insights/recurring/get-insights-recurring";
import {
  buildInsightsRecurring,
  type BuildInsightsRecurringInput,
  type RecurringAnalyticsCorrection,
  type RecurringAnalyticsPayment,
} from "@/modules/insights/recurring/insights-recurring";
import {
  DEFAULT_RECURRING_HORIZON,
  parseRecurringHorizon,
} from "@/modules/insights/recurring/insights-recurring.types";
import {
  insightsRecurringHref,
  insightsSectionHref,
  recurringDetailHref,
  transactionDetailHref,
} from "@/modules/insights/ui/insights-links";
import {
  recurringNotes,
  recurringQueryState,
  recurringShareChartData,
  recurringSignalCopy,
  recurringStatusLines,
  recurringTrendSummary,
} from "@/modules/insights/ui/recurring-format";
import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

const timeZone = "UTC";
const labels = getDashboardLabels("en");
const midSeptember = new Date("2026-09-15T12:00:00.000Z");
const plain = (value: string) => value.replace(/[  ]/g, " ");

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

const ledger: MoneyTransaction[] = [
  entry("rent-jun", "EXPENSE", 100_000n, "2026-06-03"),
  entry("rent-jul", "EXPENSE", 100_000n, "2026-07-03"),
  entry("rent-aug", "EXPENSE", 100_000n, "2026-08-03"),
  entry("rent-sep", "EXPENSE", 120_000n, "2026-09-03"),
  entry("rent-future", "EXPENSE", 150_000n, "2026-09-28"),
  entry("stream-jul", "EXPENSE", 5_000n, "2026-07-07"),
  entry("stream-aug", "EXPENSE", 5_000n, "2026-08-07"),
  entry("stream-sep", "EXPENSE", 50_000n, "2026-09-07"),
  entry("stream-sep-reversal", "EXPENSE", 50_000n, "2026-09-09", { reversalOfTransactionId: "stream-sep" }),
  entry("stream-sep-fix", "EXPENSE", 5_000n, "2026-09-07"),
  entry("gym-jul", "EXPENSE", 20_000n, "2026-07-10"),
  entry("phone-aug", "EXPENSE", 10_000n, "2026-08-12"),
  entry("phone-sep", "EXPENSE", 10_500n, "2026-09-12"),
  entry("phone-refund", "REFUND", 2_000n, "2026-09-13", { refundedTransactionId: "phone-sep" }),
  entry("news-jul", "EXPENSE", 4_000n, "2026-07-08"),
  entry("news-aug", "EXPENSE", 4_000n, "2026-08-08"),
  entry("news-sep", "EXPENSE", 6_000n, "2026-09-08"),
  entry("news-refund", "REFUND", 6_000n, "2026-09-10", { refundedTransactionId: "news-sep" }),
  entry("insurance-jun", "EXPENSE", 8_000n, "2026-06-01"),
  entry("music-aug", "EXPENSE", 3_000n, "2026-08-09"),
  entry("cloud-sep", "EXPENSE", 2_000n, "2026-09-02"),
  entry("salary-jul", "INCOME", 300_000n, "2026-07-01"),
  entry("salary-aug", "INCOME", 300_000n, "2026-08-01"),
  entry("salary-sep", "INCOME", 300_000n, "2026-09-01"),
  entry("transfer-sep", "TRANSFER", 50_000n, "2026-09-05"),
  entry("groceries-jul", "EXPENSE", 50_000n, "2026-07-15"),
  entry("groceries-aug", "EXPENSE", 60_000n, "2026-08-15"),
  entry("groceries-sep", "EXPENSE", 70_000n, "2026-09-11"),
  entry("rent-pending", "EXPENSE", 99_000n, "2026-09-14", { status: "PENDING" }),
  entry("eur-sep", "EXPENSE", 900n, "2026-09-04", { currency: "EUR" }),
];

function payment(
  id: string,
  overrides: Partial<RecurringAnalyticsPayment> & Pick<RecurringAnalyticsPayment, "typicalAmountMinor" | "lastOccurredAt">,
): RecurringAnalyticsPayment {
  return {
    id,
    displayName: null,
    normalizedMerchant: id,
    direction: "EXPENSE",
    status: "CONFIRMED",
    lifecycle: "ACTIVE",
    currency: "XAF",
    amountToleranceBps: 0,
    cadenceDays: 30,
    nextOccurrenceAt: null,
    sampleTransactionIds: [],
    ...overrides,
  };
}

const day = (value: string) => new Date(`${value}T12:00:00.000Z`);

const recurringPayments: RecurringAnalyticsPayment[] = [
  payment("rent", {
    displayName: "Rent",
    typicalAmountMinor: 120_000n,
    lastOccurredAt: day("2026-09-03"),
    sampleTransactionIds: ["rent-jun", "rent-jul", "rent-aug", "rent-sep", "rent-future", "rent-pending", "transfer-sep"],
  }),
  payment("stream", {
    typicalAmountMinor: 5_000n,
    lastOccurredAt: day("2026-09-07"),
    sampleTransactionIds: ["stream-jul", "stream-aug", "stream-sep"],
  }),
  payment("gym", {
    lifecycle: "PAUSED",
    typicalAmountMinor: 20_000n,
    lastOccurredAt: day("2026-07-10"),
    sampleTransactionIds: ["gym-jul"],
  }),
  payment("phone", {
    amountToleranceBps: 1_000,
    typicalAmountMinor: 10_000n,
    lastOccurredAt: day("2026-09-12"),
    sampleTransactionIds: ["phone-aug", "phone-sep"],
  }),
  payment("news", {
    typicalAmountMinor: 4_000n,
    lastOccurredAt: day("2026-09-08"),
    sampleTransactionIds: ["news-jul", "news-aug", "news-sep"],
  }),
  payment("insurance", {
    typicalAmountMinor: 8_000n,
    lastOccurredAt: day("2026-06-01"),
    sampleTransactionIds: ["insurance-jun"],
  }),
  payment("music", {
    status: "IGNORED",
    typicalAmountMinor: 3_000n,
    lastOccurredAt: day("2026-08-09"),
    sampleTransactionIds: ["music-aug"],
  }),
  payment("cloud", {
    status: "CANDIDATE",
    typicalAmountMinor: 2_000n,
    lastOccurredAt: day("2026-09-02"),
    sampleTransactionIds: ["cloud-sep"],
  }),
  payment("salary", {
    direction: "INCOME",
    typicalAmountMinor: 300_000n,
    lastOccurredAt: day("2026-09-01"),
    sampleTransactionIds: ["salary-jul", "salary-aug", "salary-sep"],
  }),
  payment("eur-sub", {
    currency: "EUR",
    typicalAmountMinor: 900n,
    lastOccurredAt: day("2026-09-04"),
    sampleTransactionIds: ["eur-sep"],
  }),
  payment("usd-plan", {
    currency: "USD",
    typicalAmountMinor: 1_500n,
    lastOccurredAt: day("2026-09-01"),
  }),
];

const corrections: RecurringAnalyticsCorrection[] = [
  { originalTransactionId: "stream-sep", reversalTransactionId: "stream-sep-reversal", replacementTransactionId: "stream-sep-fix" },
];

function recurring(overrides: Partial<BuildInsightsRecurringInput> = {}) {
  return buildInsightsRecurring({
    transactions: ledger,
    recurringPayments,
    corrections,
    merchants: [{ normalizedName: "stream", name: "StreamCo" }],
    requestedCurrency: null,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    range: "3m",
    horizon: "30d",
    periodKey: undefined,
    now: midSeptember,
    ...overrides,
  });
}

const sum = (values: readonly string[]) => values.reduce((total, value) => total + BigInt(value), 0n).toString();

test("actual recurring totals come only from matched posted transactions, never projections", () => {
  const result = recurring();
  assert.equal(result.current.firstDate, "2026-07-01");
  assert.equal(result.current.lastDate, "2026-09-15");
  assert.equal(result.actual.spending.minor, "381500");
  assert.equal(result.actual.spending.previousMinor, "108000");
  assert.equal(result.actual.income.minor, "900000");
  assert.equal(result.actual.totalSpendingMinor, "566500");
  assert.equal(result.actual.paidCount, 6);

  const longer = recurring({ horizon: "90d" });
  assert.deepEqual(longer.actual, result.actual);
  assert.deepEqual(longer.months, result.months);
  assert.notEqual(longer.upcoming.outflowMinor, result.upcoming.outflowMinor);

  assert.deepEqual(
    result.months.map((month) => [month.month, month.recurringSpendingMinor, month.totalSpendingMinor, month.isPartial]),
    [
      ["2026-07", "129000", "179000", false],
      ["2026-08", "119000", "182000", false],
      ["2026-09", "133500", "205500", true],
    ],
  );
  assert.equal(sum(result.months.map((month) => month.recurringSpendingMinor)), result.actual.spending.minor);
  assert.equal(sum(result.months.map((month) => month.recurringIncomeMinor)), result.actual.income.minor);
});

test("upcoming commitments are projections of confirmed active items inside the horizon", () => {
  const { upcoming } = recurring();
  assert.equal(upcoming.horizon, "30d");
  assert.equal(upcoming.firstDate, "2026-09-15");
  assert.equal(upcoming.lastDate, "2026-10-14");
  assert.deepEqual(
    upcoming.items.map((item) => [item.date, item.recurringId, item.flow, item.amountMinor]),
    [
      ["2026-09-29", "insurance", "OUTFLOW", "8000"],
      ["2026-10-01", "salary", "INFLOW", "300000"],
      ["2026-10-03", "rent", "OUTFLOW", "120000"],
      ["2026-10-07", "stream", "OUTFLOW", "5000"],
      ["2026-10-08", "news", "OUTFLOW", "4000"],
      ["2026-10-12", "phone", "OUTFLOW", "10000"],
    ],
  );
  assert.equal(upcoming.outflowMinor, "147000");
  assert.equal(upcoming.inflowMinor, "300000");
  assert.equal(upcoming.occurrenceCount, 6);
  assert.equal(upcoming.commitmentCount, 6);
  assert.equal(upcoming.hasVariableAmounts, true);
  assert.equal(upcoming.items.find((item) => item.recurringId === "phone")!.isVariable, true);
  assert.deepEqual(
    upcoming.weeks.map((week) => [week.start, week.outflowMinor, week.peakShareBps]),
    [
      ["2026-09-15", "0", 0],
      ["2026-09-22", "0", 0],
      ["2026-09-29", "128000", 10_000],
      ["2026-10-06", "19000", 1484],
      ["2026-10-13", "0", 0],
    ],
  );

  const ninety = recurring({ horizon: "90d" }).upcoming;
  assert.equal(ninety.lastDate, "2026-12-13");
  assert.equal(ninety.occurrenceCount, 18);
  assert.equal(ninety.outflowMinor, "441000");
  assert.equal(ninety.inflowMinor, "900000");
  assert.equal(ninety.items.length, 10);
  assert.equal(ninety.remainingCount, 8);
  assert.equal(parseRecurringHorizon("60d"), "60d");
  assert.equal(parseRecurringHorizon(["90d"]), "90d");
  assert.equal(parseRecurringHorizon("365d"), DEFAULT_RECURRING_HORIZON);
});

test("recurring share compares recurring spending to all actual spending, with transfers at zero", () => {
  const result = recurring();
  assert.equal(result.actual.shareBps, 6734);
  assert.equal(result.actual.previousShareBps, 10_000);
  assert.deepEqual(result.months.map((month) => month.shareBps), [7206, 6538, 6496]);
  for (const month of result.months) {
    assert.equal(
      BigInt(month.recurringSpendingMinor) + BigInt(month.otherSpendingMinor),
      BigInt(month.totalSpendingMinor),
    );
  }
  const rent = result.topItems.outflows.find((item) => item.id === "rent")!;
  assert.equal(rent.actualMinor, "320000");
  assert.equal(rent.paymentCount, 3);
  assert.equal(result.exclusions.transferCount, 1);

  const noSpending = recurring({ transactions: ledger.filter((transaction) => transaction.kind === "INCOME") });
  assert.equal(noSpending.actual.shareBps, 0);
});

test("refunds reduce recurring spending and corrections follow the replacement transaction", () => {
  const result = recurring();
  const byId = new Map(result.topItems.outflows.map((item) => [item.id, item]));
  assert.equal(byId.get("phone")!.actualMinor, "18500");
  assert.equal(byId.get("news")!.actualMinor, "8000");
  assert.equal(byId.get("stream")!.actualMinor, "15000");
  assert.equal(byId.get("stream")!.name, "StreamCo");
  assert.equal(byId.get("stream")!.latestTransactionId, "stream-sep-fix");

  const uncorrected = recurring({ corrections: [] });
  const stream = uncorrected.topItems.outflows.find((item) => item.id === "stream")!;
  assert.equal(stream.actualMinor, "10000");
  assert.equal(
    BigInt(result.actual.spending.minor) - BigInt(uncorrected.actual.spending.minor),
    5_000n,
  );
});

test("price changes use the two latest effective charges and respect tolerance, refunds and the window", () => {
  const result = recurring();
  assert.deepEqual(result.priceChanges, [
    {
      recurringId: "rent",
      name: "Rent",
      flow: "OUTFLOW",
      previousMinor: "100000",
      currentMinor: "120000",
      deltaMinor: "20000",
      percentage: "20",
      previousDate: "2026-08-03",
      changedDate: "2026-09-03",
      transactionId: "rent-sep",
      previousTransactionId: "rent-aug",
    },
  ]);

  const july = recurring({ periodKey: "2026-07", range: "3m" });
  assert.equal(july.priceChanges.length, 0);

  const strict = recurring({
    recurringPayments: recurringPayments.map((item) =>
      item.id === "phone" ? { ...item, amountToleranceBps: 0 } : item,
    ),
  });
  assert.deepEqual(strict.priceChanges.map((change) => [change.recurringId, change.percentage]), [
    ["rent", "20"],
    ["phone", "5"],
  ]);
});

test("paused items keep their actuals but are never projected; ignored and candidates are excluded", () => {
  const result = recurring();
  assert.deepEqual(result.counts, { active: 6, paused: 1, ignored: 1, needsReview: 1, otherCurrency: 2 });
  const gym = result.topItems.outflows.find((item) => item.id === "gym")!;
  assert.equal(gym.lifecycle, "PAUSED");
  assert.equal(gym.actualMinor, "20000");
  const projected = new Set(recurring({ horizon: "90d" }).upcoming.items.map((item) => item.recurringId));
  for (const excluded of ["gym", "music", "cloud", "eur-sub"]) assert.equal(projected.has(excluded), false, excluded);
  const ranked = result.topItems.outflows.map((item) => item.id);
  assert.equal(ranked.includes("music"), false);
  assert.equal(ranked.includes("cloud"), false);
  assert.deepEqual(ranked, ["rent", "gym", "phone", "stream", "news"]);
  assert.deepEqual(result.topItems.inflows.map((item) => [item.id, item.actualMinor, item.shareBps]), [["salary", "900000", 10_000]]);
  assert.deepEqual(recurringStatusLines(result, labels), ["6 active", "1 paused", "1 ignored", "1 to review"]);
});

test("deterministic signals cover increases, price changes, overdue items and review needs", () => {
  const result = recurring();
  assert.deepEqual(result.signals, [
    { kind: "recurringIncrease", deltaMinor: "273500", percentage: "253" },
    { kind: "priceIncrease", recurringId: "rent", name: "Rent", count: 1, deltaMinor: "20000", percentage: "20" },
    { kind: "overdue", recurringId: "insurance", name: "insurance", count: 1, lastDate: "2026-06-01" },
    { kind: "needsReview", count: 1 },
  ]);
  const copy = result.signals.map((signal) => recurringSignalCopy(signal, result, labels, "home"));
  assert.equal(plain(copy[1]!.body), "Rent now costs FCFA 20,000 more (20%).");
  assert.equal(copy[1]!.href, "/w/home/recurring/rent");
  assert.equal(plain(copy[2]!.body), "insurance has not been paid since Jun 1. It may have ended.");
  assert.equal(copy[3]!.href, "/w/home/recurring?filter=NEEDS_REVIEW");
  assert.deepEqual(recurring({ now: new Date("2026-07-20T12:00:00.000Z"), recurringPayments: [] }).signals, []);
});

test("one report currency at a time, without conversion or cross-currency sums", () => {
  const xaf = recurring();
  assert.deepEqual(xaf.currencies.map((option) => option.code), ["XAF", "EUR", "USD"]);
  assert.equal(xaf.exclusions.otherCurrencyCount, 1);

  const eur = recurring({ requestedCurrency: "EUR" });
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.actual.spending.minor, "900");
  assert.equal(eur.actual.totalSpendingMinor, "900");
  assert.equal(eur.actual.shareBps, 10_000);
  assert.deepEqual(eur.counts, { active: 1, paused: 0, ignored: 0, needsReview: 0, otherCurrency: 10 });
  assert.deepEqual(eur.upcoming.items.map((item) => item.recurringId), ["eur-sub"]);

  const usd = recurring({ requestedCurrency: "USD" });
  assert.equal(usd.actual.spending.minor, "0");
  assert.equal(usd.upcoming.outflowMinor, "1500");
  assert.equal(recurring({ requestedCurrency: "GBP" }).currency, "XAF");
});

test("navigation links to canonical detail pages and preserves period, range, currency and horizon", async () => {
  const state = recurringQueryState(recurring({ range: "12m", requestedCurrency: "EUR", periodKey: "2026-08", horizon: "60d" }));
  assert.equal(insightsRecurringHref("home", state), "/w/home/insights/recurring?period=2026-08&range=12m&currency=EUR&horizon=60d");
  assert.equal(
    insightsRecurringHref("home", { ...state, range: "6m", currency: "XAF", horizon: "30d" }),
    "/w/home/insights/recurring?period=2026-08&range=6m",
  );
  assert.equal(recurringDetailHref("home", "rent"), "/w/home/recurring/rent");
  assert.equal(transactionDetailHref("home", "rent-sep"), "/w/home/transactions/rent-sep");
  assert.equal(
    insightsSectionHref("home", "recurring", "period=2026-08&range=12m&currency=EUR&horizon=90d&page=2"),
    "/w/home/insights/recurring?period=2026-08&range=12m&currency=EUR&horizon=90d",
  );
  assert.equal(insightsSectionHref("home", "recurring", "period=2026-08&range=1m&horizon=7d"), "/w/home/insights/recurring?period=2026-08");
  assert.equal(insightsSectionHref("home", "trends", "period=2026-08&horizon=90d"), "/w/home/insights/trends?period=2026-08");
  assert.equal(insightsSectionHref("home", "overview", "range=1m&horizon=60d"), "/w/home/insights?range=1m");

  const [top, prices, upcoming, tabs, trendsCard, navigation] = await Promise.all([
    readFile("src/modules/insights/ui/components/recurring-top-items.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/recurring-price-changes.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/recurring-upcoming.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/insights-section-tabs.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/trends-recurring.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/insights-navigation.tsx", "utf8"),
  ]);
  assert.match(top, /recurringDetailHref\(workspaceSlug, item\.id\)/);
  assert.match(top, /transactionDetailHref\(\s*workspaceSlug,\s*item\.latestTransactionId/);
  assert.match(prices, /transactionDetailHref\(\s*workspaceSlug,\s*change\.transactionId/);
  assert.match(upcoming, /recurringDetailHref\(workspaceSlug, item\.recurringId\)/);
  assert.match(upcoming, /navigate\(\{ horizon:/);
  assert.match(tabs, /"overview",\s*"trends",\s*"recurring"/);
  assert.match(trendsCard, /insightsRecurringHref\(workspaceSlug, trendsQueryState\(trends\)\)/);
  assert.match(navigation, /"period" \| "range" \| "currency" \| "horizon"/);
});

const actor: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };

function ledgerRecord(transaction: MoneyTransaction): LedgerTransactionRecord {
  return {
    ...transaction,
    reversalOfTransactionId: transaction.reversalOfTransactionId ?? null,
    workspaceId: "workspace",
    accountId: "main",
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

test("the query authorizes membership, reads corrections and excludes opening balances", async () => {
  const readers = {
    findMembership: async (workspaceId: string, userId: string) =>
      userId === actor.userId
        ? { workspaceId, userId, role: "MEMBER" as const, invitedByUserId: null, joinedAt: midSeptember, createdAt: midSeptember, updatedAt: midSeptember }
        : null,
    listTransactions: async () => [
      ...ledger.filter((transaction) => transaction.id.startsWith("stream")).map(ledgerRecord),
      { ...ledgerRecord(entry("opening", "INCOME", 1_000_000n, "2026-09-01")), kind: "OPENING_BALANCE" as const },
    ],
    listMerchants: async () => [],
    listCorrections: async () => corrections,
    listRecurringPayments: async () => recurringPayments.filter((item) => item.id === "stream"),
  };
  const input = {
    actor,
    workspaceId: "workspace",
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    range: "3m" as const,
    horizon: "30d" as const,
    periodKey: undefined,
    requestedCurrency: null,
    now: midSeptember,
  };
  const result = await getInsightsRecurringWithReaders(input, readers);
  assert.equal(result.actual.spending.minor, "15000");
  assert.equal(result.actual.income.minor, "0");
  assert.equal(result.hasRecurring, true);
  await assert.rejects(
    getInsightsRecurringWithReaders({ ...input, actor: { ...actor, userId: "stranger" } }, readers),
    AuthorizationError,
  );
});

test("every Recurring analytics label exists in English, French, and German with the same placeholders", () => {
  const keys = (Object.keys(labels) as DashboardMessageKey[]).filter((key) => key.startsWith("insights.recurring."));
  assert.ok(keys.length >= 70);
  const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const language of ["en", "fr", "de"] as const) {
    const localized = getDashboardLabels(language);
    for (const key of [...keys, "insights.sections.recurring" as const]) {
      assert.ok(localized[key]?.trim(), `${language} is missing ${key}`);
      assert.deepEqual(placeholders(localized[key]), placeholders(labels[key]), `${language} ${key}`);
    }
  }
  const result = recurring();
  assert.equal(
    plain(recurringTrendSummary({ ...result, locale: "fr-FR" }, getDashboardLabels("fr"))),
    "Sur 3 mois, les paiements récurrents ont totalisé 381 500 FCFA, soit 67 % des dépenses.",
  );
  assert.equal(getDashboardLabels("fr")["insights.sections.recurring"], "Récurrents");
  assert.equal(getDashboardLabels("de")["insights.recurring.projected"], "Prognose");
  assert.equal(recurringShareChartData(result.months, "XAF", "de-DE")[0]!.label, "Jul");
  assert.ok(recurringNotes(result, labels).includes(labels["insights.recurring.notes.projected"]));
});

test("Recurring analytics is responsive, has its own skeleton, separates Actual from Projected and keeps math out of React", async () => {
  const files = [
    "src/modules/insights/ui/views/insights-recurring-view.tsx",
    "src/modules/insights/ui/components/recurring-summary.tsx",
    "src/modules/insights/ui/components/recurring-share-chart.tsx",
    "src/modules/insights/ui/components/recurring-upcoming.tsx",
    "src/modules/insights/ui/components/recurring-top-items.tsx",
    "src/modules/insights/ui/components/recurring-price-changes.tsx",
    "src/modules/insights/ui/components/recurring-signals.tsx",
    "src/app/w/[workspaceSlug]/insights/recurring/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const [view, summary, chart, upcoming] = sources;
  const loading = await readFile("src/app/w/[workspaceSlug]/insights/recurring/loading.tsx", "utf8");

  assert.match(view!, /InsightsLoadingSurface/);
  assert.match(view!, /lg:grid-cols-\[minmax\(0,1\.4fr\)_minmax\(0,1fr\)\]/);
  assert.match(summary!, /grid-cols-2[^"]*lg:grid-cols-4/);
  assert.match(chart!, /<table className="sr-only">/);
  assert.match(chart!, /isMobile/);
  assert.match(chart!, /insights\.recurring\.actual/);
  assert.match(upcoming!, /border-dashed/);
  assert.match(upcoming!, /insights\.recurring\.projected/);
  assert.match(loading, /RecurringAnalyticsSkeleton/);
  assert.doesNotMatch(loading, /FilterLoadingSurface/);
  sources.forEach((source, index) => {
    assert.doesNotMatch(source, /BigInt\(|Number\(|\b\d+n\b/, files[index]);
  });
});
