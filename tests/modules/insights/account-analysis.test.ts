import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import type { CurrencyCode } from "@/money/currency";
import {
  buildAccountAnalysis,
  summarizeAccounts,
  type AccountAnalysisAccount,
  type AccountLedgerEntry,
  type BuildAccountAnalysisInput,
} from "@/modules/insights/account/account-analysis";
import {
  getAccountAnalysisWithReaders,
  type AccountAnalysisReaders,
} from "@/modules/insights/account/get-account-analysis";
import { buildInsightsOverview } from "@/modules/insights/overview/insights-overview";
import {
  accountAnalysisNotes,
  accountInsightCopy,
  accountTransactionsHref,
} from "@/modules/insights/ui/account-analysis-format";
import { insightsAccountHref, insightsOverviewHref } from "@/modules/insights/ui/insights-links";
import type { LedgerAccountRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import { createPeriod } from "@/money/period";

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
    accountId: "checking",
    transferAccountId: null,
    ...overrides,
  };
}

function account(id: string, overrides: Partial<AccountAnalysisAccount> = {}): AccountAnalysisAccount {
  return { id, name: names[id] ?? id, type: "CHECKING", currency: "XAF", archivedAt: null, ...overrides };
}

const names: Record<string, string> = {
  checking: "Main checking",
  savings: "Savings",
  housing: "Housing",
  groceries: "Groceries",
  dining: "Dining",
  salary: "Salary",
  "m-employer": "Employer",
  "m-landlord": "Landlord",
  "m-market": "Market",
  "m-bistro": "Bistro",
  "m-cafe": "Cafe",
};

const ledger: AccountLedgerEntry[] = [
  entry("a-salary", "INCOME", 300_000n, "2026-08-02", { categoryId: "salary", merchantId: "m-employer" }),
  entry("a-rent", "EXPENSE", 100_000n, "2026-08-05", { categoryId: "housing", merchantId: "m-landlord" }),
  entry("salary", "INCOME", 300_000n, "2026-09-01", { categoryId: "salary", merchantId: "m-employer" }),
  entry("rent", "EXPENSE", 100_000n, "2026-09-03", { categoryId: "housing", merchantId: "m-landlord" }),
  entry("g1", "EXPENSE", 20_000n, "2026-09-04", { categoryId: "groceries", merchantId: "m-market" }),
  entry("t-out", "TRANSFER", 50_000n, "2026-09-05", { transferAccountId: "savings" }),
  entry("c0", "EXPENSE", 40_000n, "2026-09-06", { categoryId: "dining", merchantId: "m-bistro" }),
  entry("c0-reversal", "EXPENSE", 40_000n, "2026-09-06", { categoryId: "dining", merchantId: "m-bistro", reversalOfTransactionId: "c0" }),
  entry("c1", "EXPENSE", 30_000n, "2026-09-06", { categoryId: "dining", merchantId: "m-bistro" }),
  entry("other", "EXPENSE", 9_000n, "2026-09-08", { categoryId: "groceries", accountId: "savings" }),
  entry("eur", "EXPENSE", 2_000n, "2026-09-09", { categoryId: "groceries", currency: "EUR" }),
  entry("g2", "EXPENSE", 10_000n, "2026-09-10", { categoryId: "groceries", merchantId: "m-market" }),
  entry("r1", "REFUND", 5_000n, "2026-09-11", { refundedTransactionId: "g2" }),
  entry("t-in", "TRANSFER", 15_000n, "2026-09-12", { accountId: "savings", transferAccountId: "checking" }),
  entry("p1", "EXPENSE", 7_000n, "2026-09-13", { categoryId: "groceries", status: "PENDING" }),
];

const openingBalance = { amountMinor: 500_000n, occurredAt: new Date("2026-07-01T00:00:00.000Z") };

function analyze(overrides: Partial<BuildAccountAnalysisInput> = {}) {
  return buildAccountAnalysis({
    transactions: ledger,
    account: account("checking"),
    balance: { currentBalanceMinor: 810_000n, availableBalanceMinor: 810_000n, spendabilityMode: "ZERO_FLOOR" },
    openingBalance,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    range: "1m",
    periodKey: undefined,
    now: midSeptember,
    resolveName: (dimension, id) => (dimension === "category" && id === "__uncategorized__" ? "Uncategorized" : names[id] ?? null),
    resolveAccountName: (id) => names[id] ?? null,
    ...overrides,
  });
}

// Mirrors the canonical posted-balance SQL, including raw reversal rows.
function canonicalBalance(records: readonly AccountLedgerEntry[], accountId: string, opening: bigint): bigint {
  let balance = opening;
  for (const record of records) {
    if (record.status !== "POSTED") continue;
    const sign = record.reversalOfTransactionId ? -1n : 1n;
    if (record.accountId === accountId) {
      if (record.kind === "TRANSFER") balance -= record.amountMinor;
      else if (record.kind === "EXPENSE") balance -= sign * record.amountMinor;
      else balance += sign * record.amountMinor;
    }
    if (record.kind === "TRANSFER" && record.transferAccountId === accountId) balance += record.amountMinor;
  }
  return balance;
}

test("account scoping keeps only this account's legs and reports account movement", () => {
  const result = analyze();

  assert.equal(result.kpis.inflows.minor, "320000");
  assert.equal(result.kpis.outflows.minor, "210000");
  assert.equal(result.kpis.net.minor, "110000");
  assert.equal(result.kpis.inflows.previousMinor, "300000");
  assert.equal(result.kpis.outflows.previousMinor, "100000");
  assert.deepEqual(result.kpis.transactionCount, { current: 8, previous: 2 });
  assert.deepEqual(result.transactions.items.map((item) => item.id), ["t-in", "r1", "g2", "c1", "t-out", "g1", "rent", "salary"]);
  assert.equal(result.transactions.totalCount, 8);
  assert.ok(!result.transactions.items.some((item) => item.id === "other"));
  assert.equal(result.account.status, "ACTIVE");
  assert.equal(result.currency, "XAF");
});

test("transfers move account balances but stay out of category spending and workspace income or spending", () => {
  const result = analyze();
  assert.deepEqual(result.composition, {
    incomeMinor: "300000",
    refundsMinor: "5000",
    transfersInMinor: "15000",
    expensesMinor: "160000",
    transfersOutMinor: "50000",
  });
  assert.equal(result.transactions.transferCount, 2);
  assert.equal(result.categories.totalMinor, "155000");
  assert.ok(!result.categories.items.some((item) => item.id === "__uncategorized__"));

  const savings = analyze({ account: account("savings") });
  assert.equal(savings.kpis.inflows.minor, "50000");
  assert.equal(savings.kpis.outflows.minor, "24000");
  assert.deepEqual(savings.transactions.items.map((item) => [item.id, item.movement, item.signedMinor]), [
    ["t-in", "TRANSFER_OUT", "-15000"],
    ["other", "EXPENSE", "-9000"],
    ["t-out", "TRANSFER_IN", "50000"],
  ]);

  const overview = (transactions: readonly AccountLedgerEntry[]) =>
    buildInsightsOverview({
      transactions,
      requestedCurrency: null,
      workspaceCurrency: "XAF",
      locale: "en-US",
      timeZone,
      range: "1m",
      periodKey: undefined,
      now: midSeptember,
      resolveName: () => null,
    }).kpis;
  const withTransfers = overview(ledger);
  const withoutTransfers = overview(ledger.filter((item) => item.kind !== "TRANSFER"));
  assert.equal(withTransfers.spending.minor, withoutTransfers.spending.minor);
  assert.equal(withTransfers.income.minor, withoutTransfers.income.minor);
});

test("refunds and corrections follow effective truth and technical reversals stay hidden", () => {
  const result = analyze();
  const refund = result.transactions.items.find((item) => item.id === "r1")!;
  assert.deepEqual(
    { movement: refund.movement, signedMinor: refund.signedMinor, merchantName: refund.merchantName, categoryName: refund.categoryName },
    { movement: "REFUND", signedMinor: "5000", merchantName: "Market", categoryName: "Groceries" },
  );
  assert.deepEqual(
    result.categories.items.map((item) => [item.id, item.spendingMinor, item.previousSpendingMinor, item.shareBps, item.transactionCount]),
    [
      ["housing", "100000", "100000", 6451, 1],
      ["dining", "30000", "0", 1935, 1],
      ["groceries", "25000", "0", 1612, 3],
    ],
  );
  assert.ok(!result.transactions.items.some((item) => item.id === "c0" || item.id === "c0-reversal"));
  assert.deepEqual(result.exclusions, { pendingCount: 1, otherCurrencyCount: 1 });
});

test("balance evolution starts from the canonical opening balance and matches the canonical posted balance", () => {
  const result = analyze();
  assert.equal(result.balances.periodOpeningMinor, "700000");
  assert.equal(result.balances.periodClosingMinor, "810000");
  assert.equal(
    result.balances.periodClosingMinor,
    canonicalBalance(ledger.filter((item) => item.currency === "XAF"), "checking", openingBalance.amountMinor).toString(),
  );
  assert.equal(result.balances.currentMinor, "810000");
  assert.equal(result.balances.availableMinor, "810000");
  assert.deepEqual(result.balances.openingBalance, { amountMinor: "500000", date: "2026-07-01" });

  const points = result.balanceTrend.points;
  assert.equal(points.length, 30);
  assert.deepEqual(
    points.slice(0, 6).map((point) => point.balanceMinor),
    ["1000000", "1000000", "900000", "880000", "830000", "800000"],
  );
  assert.equal(points[14]?.balanceMinor, "810000");
  assert.ok(points.slice(15).every((point) => point.balanceMinor === null));
  assert.equal(result.balanceTrend.hasMovement, true);

  const credit = analyze({
    account: account("checking", { type: "CREDIT_CARD" }),
    balance: { currentBalanceMinor: 810_000n, availableBalanceMinor: 810_000n, spendabilityMode: "UNSUPPORTED" },
  });
  assert.equal(credit.balances.availableMinor, null);

  const august = analyze({ periodKey: "2026-08" });
  assert.equal(august.balances.periodOpeningMinor, "500000");
  assert.equal(august.balances.periodClosingMinor, "700000");
  assert.ok(august.balanceTrend.points.every((point) => point.balanceMinor !== null));
});

test("each account is reported in its own currency and never converted or combined", () => {
  const result = analyze();
  assert.ok(!result.transactions.items.some((item) => item.id === "eur"));
  assert.equal(result.categories.totalMinor, "155000");
  assert.match(plain(accountAnalysisNotes(result, labels).at(-1)!), /Amounts are in XAF only\. 1 transactions/);

  const euro = analyze({ account: account("checking", { currency: "EUR" }), openingBalance: null });
  assert.equal(euro.currency, "EUR");
  assert.equal(euro.kpis.outflows.minor, "2000");
  assert.equal(euro.kpis.inflows.minor, "0");
  assert.equal(euro.exclusions.otherCurrencyCount, 8);

  const summaries = summarizeAccounts({
    transactions: ledger,
    accounts: [
      account("checking"),
      account("savings", { type: "SAVINGS" }),
      account("wallet", { currency: "EUR" }),
      account("old", { archivedAt: midSeptember }),
    ],
    currency: "XAF",
    period: createPeriod(new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-16T00:00:00.000Z")),
    limit: 5,
  });
  assert.deepEqual(summaries.map((summary) => [summary.id, summary.inflowsMinor, summary.outflowsMinor, summary.netMinor]), [
    ["checking", "320000", "210000", "110000"],
    ["savings", "50000", "24000", "26000"],
  ]);
});

test("deterministic insights cover the strongest outflow week and an unusual movement", () => {
  const result = analyze();
  assert.deepEqual(result.insights, [
    { kind: "strongestOutflowWeek", firstDate: "2026-09-01", lastDate: "2026-09-06", outflowMinor: "200000", shareBps: 9523 },
    {
      kind: "unusualMovement",
      transactionId: "salary",
      date: "2026-09-01",
      direction: "inflow",
      amountMinor: "300000",
      multiple: 12,
      counterpartyName: "Employer",
    },
  ]);
  const copy = result.insights.map((insight) => plain(accountInsightCopy(insight, result, labels, "home").body));
  assert.deepEqual(copy, [
    "Sep 1 – 6, 2026: FCFA 200,000 left this account, 95% of this period’s outflows.",
    "FCFA 300,000 from Employer on Sep 1, 12× a typical movement on this account.",
  ]);
  assert.equal(accountInsightCopy(result.insights[1]!, result, labels, "home").href, "/w/home/transactions/salary");
});

test("repeat payees and a balance dip are surfaced only when they stand out", () => {
  const result = analyze({
    transactions: [
      entry("cafe-1", "EXPENSE", 10_000n, "2026-09-02", { merchantId: "m-cafe" }),
      entry("cafe-2", "EXPENSE", 10_000n, "2026-09-09", { merchantId: "m-cafe" }),
      entry("pay", "INCOME", 50_000n, "2026-09-12"),
    ],
    openingBalance: { amountMinor: 100_000n, occurredAt: new Date("2026-07-01T00:00:00.000Z") },
  });
  assert.deepEqual(result.insights, [
    { kind: "strongestOutflowWeek", firstDate: "2026-09-01", lastDate: "2026-09-06", outflowMinor: "10000", shareBps: 5000 },
    { kind: "recurringConcentration", payeeCount: 1, amountMinor: "20000", shareBps: 10000 },
    { kind: "lowestBalance", date: "2026-09-09", balanceMinor: "80000" },
  ]);

  const empty = analyze({ transactions: [], openingBalance: null });
  assert.equal(empty.hasActivity, false);
  assert.equal(empty.balanceTrend.hasMovement, false);
  assert.deepEqual(empty.insights, []);
  assert.deepEqual(empty.counterparties, []);
});

const actor: AuthenticatedActor = { userId: "member", email: "member@pace.test", name: "Member" };

function accountRecord(id: string, workspaceId = "workspace", currency = "XAF"): LedgerAccountRecord {
  return {
    id,
    workspaceId,
    name: names[id] ?? id,
    type: "CHECKING",
    currency,
    createdByUserId: actor.userId,
    archivedAt: null,
    createdAt: midSeptember,
    updatedAt: midSeptember,
  };
}

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

function readers(overrides: Partial<AccountAnalysisReaders> = {}): AccountAnalysisReaders {
  const openingRecord: LedgerTransactionRecord = {
    ...ledgerRecord(entry("opening", "INCOME", 500_000n, "2026-07-01")),
    kind: "OPENING_BALANCE",
  };
  return {
    findMembership: async (workspaceId, userId) =>
      userId === actor.userId
        ? { workspaceId, userId, role: "MEMBER", invitedByUserId: null, joinedAt: midSeptember, createdAt: midSeptember, updatedAt: midSeptember }
        : null,
    listAccounts: async () => [accountRecord("checking"), accountRecord("savings"), accountRecord("foreign", "other-workspace")],
    getAccountBalance: async (_workspaceId, accountId) => ({
      accountId,
      currency: "XAF" as CurrencyCode,
      currentBalanceMinor: 530_000n,
      availableBalanceMinor: 530_000n,
      spendabilityMode: "ZERO_FLOOR",
    }),
    findOpeningBalance: async (workspaceId, accountId) => ({
      id: "ob",
      workspaceId,
      accountId,
      originalTransactionId: "opening",
      currentTransactionId: "opening",
      createdAt: midSeptember,
      updatedAt: midSeptember,
      transaction: openingRecord,
    }),
    listTransactions: async () => [
      ledgerRecord(entry("sep", "EXPENSE", 20_000n, "2026-09-10", { merchantId: "m-market" })),
      ledgerRecord(entry("move", "TRANSFER", 50_000n, "2026-09-11", { transferAccountId: "savings" })),
      openingRecord,
    ],
    listCategories: async () => [],
    listMerchants: async () => [{
      id: "m-market",
      workspaceId: "workspace",
      name: "Market",
      normalizedName: "market",
      createdByUserId: actor.userId,
      createdAt: midSeptember,
      updatedAt: midSeptember,
    }],
    ...overrides,
  };
}

function query(accountId: string) {
  return {
    actor,
    workspaceId: "workspace",
    accountId,
    workspaceCurrency: "XAF",
    locale: "en-US",
    timeZone,
    labels,
    range: "1m" as const,
    periodKey: undefined,
    now: midSeptember,
  };
}

test("the query authorizes membership, isolates workspaces, and counts the opening balance exactly once", async () => {
  const result = await getAccountAnalysisWithReaders(query("checking"), readers());
  assert.equal(result?.balances.periodOpeningMinor, "500000");
  assert.equal(result?.balances.periodClosingMinor, "430000");
  assert.equal(result?.balances.currentMinor, "530000");
  assert.equal(result?.kpis.outflows.minor, "70000");
  assert.deepEqual(result?.transactions.items.map((item) => item.id), ["move", "sep"]);
  assert.equal(result?.transactions.items[0]?.counterpartyAccountName, "Savings");
  assert.equal(result?.transactions.items[1]?.merchantName, "Market");

  assert.equal(await getAccountAnalysisWithReaders(query("foreign"), readers()), null);
  assert.equal(await getAccountAnalysisWithReaders(query("missing"), readers()), null);
  await assert.rejects(
    getAccountAnalysisWithReaders({ ...query("checking"), actor: { ...actor, userId: "stranger" } }, readers()),
    AuthorizationError,
  );
  await assert.rejects(
    getAccountAnalysisWithReaders(query("checking"), readers({
      getAccountBalance: async (_workspaceId, accountId) => ({
        accountId,
        currency: "EUR" as CurrencyCode,
        currentBalanceMinor: 0n,
        availableBalanceMinor: 0n,
        spendabilityMode: "ZERO_FLOOR",
      }),
    })),
    /currency does not match/,
  );
});

test("navigation preserves period and range between Insights, Account Analysis and Transaction Detail", async () => {
  const state = { periodKey: "2026-08", range: "3m" as const, currency: "EUR", workspaceCurrency: "XAF" };
  assert.equal(insightsAccountHref("home", "wallet", state), "/w/home/insights/accounts/wallet?period=2026-08&range=3m&currency=EUR");
  assert.equal(
    insightsAccountHref("home", "checking", { ...state, range: "1m", currency: "XAF" }),
    "/w/home/insights/accounts/checking?period=2026-08",
  );
  assert.equal(insightsOverviewHref("home", state), "/w/home/insights?period=2026-08&range=3m&currency=EUR");
  assert.equal(
    accountTransactionsHref(analyze(), "home"),
    "/w/home/transactions?account=checking&from=2026-09-01&to=2026-09-15",
  );

  const [overviewCard, header, transactions, detail] = await Promise.all([
    readFile("src/modules/insights/ui/components/insights-accounts.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/account-analysis-header.tsx", "utf8"),
    readFile("src/modules/insights/ui/components/account-analysis-transactions.tsx", "utf8"),
    readFile("src/modules/accounts/ui/views/account-detail-view.tsx", "utf8"),
  ]);
  assert.match(overviewCard, /insightsAccountHref\(workspaceSlug, account\.id, state\)/);
  assert.match(header, /insightsOverviewHref\(workspaceSlug, accountQueryState\(analysis\)\)/);
  assert.match(transactions, /\/w\/\$\{workspaceSlug\}\/transactions\/\$\{transaction\.id\}/);
  assert.match(detail, /\/insights\/accounts\/\$\{encodeURIComponent\(account\.id\)\}/);
});

test("every Account Analysis label exists in English, French, and German with the same placeholders", () => {
  const keys = (Object.keys(labels) as DashboardMessageKey[]).filter(
    (key) => key.startsWith("insights.account.") || key.startsWith("insights.accounts.") || key === "accounts.detail.analyze",
  );
  assert.ok(keys.length >= 60);
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
  assert.equal(
    plain(accountInsightCopy(result.insights[1]!, { ...result, locale: "fr-FR" }, fr, "home").body),
    "300 000 FCFA reçus de Employer le 1 sept., soit 12× un mouvement habituel de ce compte.",
  );
  assert.equal(getDashboardLabels("de")["insights.account.kpi.outflows"], "Ausgänge");
});

test("mobile layout stacks the rail, keeps a dedicated skeleton, and leaves money math out of React", async () => {
  const files = [
    "src/modules/insights/ui/views/account-analysis-view.tsx",
    "src/modules/insights/ui/components/account-analysis-kpis.tsx",
    "src/modules/insights/ui/components/account-analysis-breakdown.tsx",
    "src/modules/insights/ui/components/account-analysis-transactions.tsx",
    "src/modules/insights/ui/components/account-analysis-insights.tsx",
    "src/modules/insights/ui/components/account-analysis-right-rail.tsx",
    "src/modules/insights/ui/components/account-analysis-header.tsx",
    "src/modules/insights/ui/components/account-balance-chart.tsx",
    "src/modules/insights/ui/components/insights-accounts.tsx",
    "src/app/w/[workspaceSlug]/insights/accounts/[accountId]/page.tsx",
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const [view, kpis] = sources;
  const loading = await readFile("src/app/w/[workspaceSlug]/insights/accounts/[accountId]/loading.tsx", "utf8");

  assert.match(view!, /xl:grid-cols-\[minmax\(0,1fr\)_/);
  assert.match(view!, /InsightsLoadingSurface/);
  assert.match(kpis!, /grid-cols-2[^"]*lg:grid-cols-4/);
  assert.match(loading, /AccountAnalysisSkeleton/);
  assert.doesNotMatch(loading, /FilterLoadingSurface/);
  sources.forEach((source, index) => {
    assert.doesNotMatch(source, /BigInt\(|Number\(|\b\d+n\b/, files[index]);
  });
});
