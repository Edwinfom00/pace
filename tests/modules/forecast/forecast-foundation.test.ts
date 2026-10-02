import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkspaceForecast } from "@/modules/forecast/domain/forecast";
import { cumulativeForecastFlows, defaultForecastInspectionIndex, forecastAxisTickIndexes, forecastCadence, forecastInsights } from "@/modules/forecast/domain/forecast-presentation";
import { getWorkspaceForecastWithReaders } from "@/modules/forecast/queries/get-workspace-forecast";
import { AuthorizationError } from "@/authorization/errors";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";
import type { LedgerAccountBalance, LedgerAccountRecord } from "@/modules/ledger/domain";
import { toCurrencyCode } from "@/money/currency";

const now = new Date("2026-01-30T12:00:00.000Z");
const account: LedgerAccountRecord = { id: "cash", workspaceId: "w", name: "Cash", type: "CASH", currency: "XAF", createdByUserId: "u", archivedAt: null, createdAt: now, updatedAt: now };
const usdAccount: LedgerAccountRecord = { ...account, id: "usd", currency: "USD" };
const xafBalance: LedgerAccountBalance = { accountId: "cash", currency: toCurrencyCode("XAF"), currentBalanceMinor: 100_000n, availableBalanceMinor: 100_000n, spendabilityMode: "ZERO_FLOOR" };
const usdBalance: LedgerAccountBalance = { accountId: "usd", currency: toCurrencyCode("USD"), currentBalanceMinor: 5000n, availableBalanceMinor: 5000n, spendabilityMode: "ZERO_FLOOR" };

function recurring(id: string, overrides: Partial<RecurringPaymentRecord> = {}): RecurringPaymentRecord {
  return {
    id, workspaceId: "w", detectionKey: id, normalizedMerchant: id, displayName: id, origin: "MANUAL", direction: "EXPENSE", accountId: "cash", categoryId: null, currency: "XAF", typicalAmountMinor: 1000n, amountToleranceBps: 0, cadenceDays: 30,
    firstOccurredAt: new Date("2026-01-01T00:00:00.000Z"), lastOccurredAt: new Date("2026-01-01T00:00:00.000Z"), nextOccurrenceAt: new Date("2026-02-01T00:00:00.000Z"), sampleTransactionIds: [], status: "CONFIRMED", lifecycle: "ACTIVE", createdByUserId: "u", idempotencyKey: null, commandFingerprint: null, confirmedByUserId: "u", confirmedAt: now, ignoredByUserId: null, ignoredAt: null, createdAt: now, updatedAt: now,
    ...overrides,
  };
}

function forecast(horizonDays: 30 | 60 | 90, payments: readonly RecurringPaymentRecord[], timeZone = "UTC") {
  return buildWorkspaceForecast({ balances: [xafBalance, usdBalance], accounts: [account, usdAccount], recurringPayments: payments, horizonDays, now, timeZone });
}

test("forecast produces deterministic 30/60/90-day local-calendar points", () => {
  for (const horizonDays of [30, 60, 90] as const) {
    const result = forecast(horizonDays, [recurring("monthly")]);
    const xaf = result.currencies.find((currency) => currency.currency === "XAF")!;
    assert.equal(xaf.points.length, horizonDays);
    assert.equal(xaf.points[0]?.date, "2026-01-30");
  }
  assert.equal(forecast(30, [recurring("monthly")]).currencies.find((item) => item.currency === "XAF")?.events.length, 1);
  assert.equal(forecast(60, [recurring("monthly")]).currencies.find((item) => item.currency === "XAF")?.events.length, 2);
  assert.equal(forecast(90, [recurring("monthly")]).currencies.find((item) => item.currency === "XAF")?.events.length, 3);
});

test("forecast applies confirmed active income and expenses while preserving variable amounts", () => {
  const result = forecast(30, [recurring("salary", { direction: "INCOME", typicalAmountMinor: 30_000n }), recurring("utility", { typicalAmountMinor: 1500n, amountToleranceBps: 1000 })]);
  const xaf = result.currencies.find((currency) => currency.currency === "XAF")!;
  assert.equal(xaf.events.length, 2);
  assert.equal(xaf.events.find((event) => event.recurringId === "utility")?.amount.uncertainty, "VARIABLE");
  assert.deepEqual(xaf.points[2]?.projectedClosingBalance, { nominalMinor: "128500", minimumMinor: "128350", maximumMinor: "128650", uncertainty: "VARIABLE", toleranceBps: 0 });
});

test("forecast excludes paused, ignored, needs-review, and unsupported transfer-like recurring entries", () => {
  const payments = [
    recurring("paused", { lifecycle: "PAUSED" }), recurring("ignored", { status: "IGNORED" }), recurring("candidate", { status: "CANDIDATE" }),
    recurring("cross-currency-account", { accountId: "usd", currency: "XAF" }),
  ];
  assert.equal(forecast(30, payments).currencies.find((item) => item.currency === "XAF")?.events.length, 0);
});

test("forecast groups currencies without FX or cross-currency totals and respects month/timezone boundaries", () => {
  const result = forecast(30, [recurring("usd-income", { accountId: "usd", currency: "USD", direction: "INCOME", typicalAmountMinor: 200n, nextOccurrenceAt: new Date("2026-02-01T00:00:00.000Z") })], "Africa/Douala");
  assert.deepEqual(result.currencies.map((item) => item.currency), ["USD", "XAF"]);
  const usd = result.currencies.find((item) => item.currency === "USD")!;
  assert.equal(usd.events[0]?.occursAt, "2026-01-31T23:00:00.000Z");
  assert.equal(usd.points.find((point) => point.date === "2026-02-01")?.projectedClosingBalance.nominalMinor, "5200");
});

test("forecast is read-only: input balances and recurring records are not mutated", () => {
  const payment = recurring("safe");
  const before = JSON.stringify({ balance: xafBalance.currentBalanceMinor.toString(), next: payment.nextOccurrenceAt?.toISOString(), status: payment.status });
  forecast(90, [payment]);
  assert.equal(JSON.stringify({ balance: xafBalance.currentBalanceMinor.toString(), next: payment.nextOccurrenceAt?.toISOString(), status: payment.status }), before);
});

test("forecast account filter is canonical, preserves currencies, and excludes unassigned recurring items", () => {
  const result = buildWorkspaceForecast({
    balances: [xafBalance, usdBalance],
    accounts: [account, usdAccount],
    recurringPayments: [
      recurring("cash", { accountId: "cash", typicalAmountMinor: 1000n }),
      recurring("usd", { accountId: "usd", currency: "USD", typicalAmountMinor: 200n }),
      recurring("unassigned", { accountId: null, typicalAmountMinor: 999n }),
    ],
    horizonDays: 30,
    now,
    timeZone: "UTC",
    accountId: "cash",
  });
  assert.equal(result.selectedAccountId, "cash");
  assert.deepEqual(result.currencies.map((currency) => currency.currency), ["XAF"]);
  assert.equal(result.currencies[0]?.events.length, 1);
  assert.equal(result.currencies[0]?.points.at(-1)?.projectedClosingBalance.nominalMinor, "99000");
  assert.equal(result.accounts.length, 2);
});

test("workspace reader rejects a non-member before any financial read", async () => {
  let reads = 0;
  await assert.rejects(
    () => getWorkspaceForecastWithReaders({ actor: { userId: "outsider", email: "o@example.com", name: "Outsider" }, workspaceId: "w", horizonDays: 30, timeZone: "UTC", now }, {
      findMembership: async () => null,
      getBalances: async () => { reads += 1; return []; },
      listAccounts: async () => { reads += 1; return []; },
      listRecurring: async () => { reads += 1; return []; },
    }),
    AuthorizationError,
  );
  assert.equal(reads, 0);
});

test("forecast exposes recurring item metadata and per-account projections", () => {
  const result = forecast(60, [
    recurring("salary", { direction: "INCOME", typicalAmountMinor: 30_000n, displayName: "Salary" }),
    recurring("rent", { typicalAmountMinor: 10_000n, displayName: null, normalizedMerchant: "landlord" }),
  ]);
  assert.deepEqual(
    result.recurringItems.map((item) => [item.id, item.name, item.direction]),
    [["rent", "landlord", "OUTFLOW"], ["salary", "Salary", "INFLOW"]],
  );
  const cash = result.accountProjections.find((item) => item.id === "cash")!;
  assert.equal(cash.currentBalanceMinor, "100000");
  assert.equal(cash.projectedBalanceMinor, "140000");
  assert.equal(result.accountProjections.find((item) => item.id === "usd")?.projectedBalanceMinor, "5000");
});

test("forecast supports six and twelve month horizons", () => {
  assert.equal(forecast(180 as 30, [recurring("monthly")]).currencies.find((item) => item.currency === "XAF")?.points.length, 180);
  assert.equal(forecast(365 as 30, [recurring("monthly")]).currencies.find((item) => item.currency === "XAF")?.events.length, 13);
});

test("forecast presentation derives insights, cumulative flows and axis ticks", () => {
  const xaf = forecast(90, [
    recurring("salary", { direction: "INCOME", typicalAmountMinor: 30_000n }),
    recurring("rent", { typicalAmountMinor: 200_000n }),
  ]).currencies.find((item) => item.currency === "XAF")!;
  const flows = cumulativeForecastFlows(xaf);
  assert.equal(flows.at(-1)?.inflowMinor, xaf.totalInflows.nominalMinor);
  assert.equal(flows.at(-1)?.outflowMinor, xaf.totalOutflows.nominalMinor);
  assert.equal(defaultForecastInspectionIndex(xaf), 2);
  const insights = forecastInsights(xaf);
  assert.deepEqual(insights[0], { kind: "TREND", direction: "DOWN", deltaMinor: "510000" });
  assert.equal(insights.find((item) => item.kind === "HEAVY_MONTH")?.kind, "HEAVY_MONTH");
  assert.equal(insights.find((item) => item.kind === "STABILITY" && item.firstNegativeDate === "2026-02-01")?.kind, "STABILITY");
  const ticks = forecastAxisTickIndexes(xaf.points.map((point) => point.date), 90);
  assert.ok(ticks.has(0) && ticks.has(89));
  assert.equal(forecastCadence(30), "MONTHLY");
  assert.equal(forecastCadence(10), "CUSTOM");
});
