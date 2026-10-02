import type {
  DashboardLabels,
  DashboardMessageKey,
} from "@/i18n/dashboard-messages";
import { currentMoneyTransactions } from "@/money";
import { localDateForInstant, localDateKey } from "@/money/period";
import {
  buildAccountAnalysis,
  type AccountLedgerEntry,
} from "@/modules/insights/account/account-analysis";
import type { AccountAnalysis } from "@/modules/insights/account/account-analysis.types";
import {
  insightsWindows,
  type InsightsNameResolver,
} from "@/modules/insights/overview/insights-overview";
import type {
  InsightsDeterministicItem,
  InsightsMetric,
  InsightsOverview,
} from "@/modules/insights/overview/insights-overview.types";
import type { InsightsRecurring } from "@/modules/insights/recurring/insights-recurring.types";
import { localizeCategoryName } from "@/modules/ledger/category-localization";
import type {
  LedgerAccountRecord,
  LedgerAccountType,
  LedgerCategoryRecord,
  LedgerMerchantRecord,
  LedgerUserFacingTransactionRecord,
} from "@/modules/ledger/domain";
import { overviewPeriodKey } from "@/modules/overview/domain/overview-financial-summary";

import {
  percentageChange,
  reportCadence,
  reportHighlights,
  reportInsights,
  reportRecommendations,
  type ReportRuleInput,
} from "../domain/financial-report-rules";
import {
  reportPages,
  type FinancialReportDTO,
  type ReportAccount,
  type ReportCategory,
  type ReportCountMetric,
  type ReportLanguage,
  type ReportMetric,
  type ReportOptionalSection,
  type ReportRecurringItem,
  type ReportTransaction,
} from "../domain/financial-report.types";
import { financialReportFileName } from "../domain/report-file-name";

export const KEY_TRANSACTION_LIMIT = 10;
export const REPORT_ACCOUNT_LIMIT = 6;
export const CATEGORY_EVOLUTION_LIMIT = 5;
export const RECURRING_ITEM_LIMIT = 7;

const ACCOUNT_TYPE_LABEL_KEYS: Readonly<
  Record<LedgerAccountType, DashboardMessageKey>
> = {
  CASH: "accounts.type.cash.label",
  CHECKING: "accounts.type.checking.label",
  SAVINGS: "accounts.type.savings.label",
  CREDIT_CARD: "accounts.type.creditCard.label",
  MOBILE_MONEY: "accounts.type.mobileMoney.label",
  OTHER: "accounts.type.other.label",
};

const DEFAULT_LANGUAGE_LOCALES: Readonly<Record<ReportLanguage, string>> = {
  en: "en-GB",
  fr: "fr-FR",
  de: "de-DE",
};

export interface ReportAccountBalanceInput {
  readonly account: LedgerAccountRecord;
  readonly balance: {
    readonly currentBalanceMinor: bigint;
    readonly availableBalanceMinor: bigint;
    readonly spendabilityMode: "ZERO_FLOOR" | "UNSUPPORTED";
  };
  readonly openingBalance: {
    readonly amountMinor: bigint;
    readonly occurredAt: Date;
  } | null;
}

export interface BuildFinancialReportInput {
  readonly overview: InsightsOverview;
  readonly engineInsights: readonly InsightsDeterministicItem[];
  readonly recurring: InsightsRecurring | null;
  readonly accountBalances: readonly ReportAccountBalanceInput[] | null;
  readonly transactions: readonly LedgerUserFacingTransactionRecord[];
  readonly categories: readonly LedgerCategoryRecord[];
  readonly merchants: readonly LedgerMerchantRecord[];
  readonly accounts: readonly LedgerAccountRecord[];
  readonly labels: DashboardLabels;
  readonly resolveName: InsightsNameResolver;
  readonly workspace: { readonly name: string; readonly slug: string };
  readonly language: ReportLanguage;
  readonly timeZone: string;
  readonly sections: readonly ReportOptionalSection[];
  readonly now: Date;
}

export function reportLocale(
  language: ReportLanguage,
  workspaceLocale: string,
): string {
  const workspaceLanguage = workspaceLocale.split("-")[0]?.toLowerCase();
  return workspaceLanguage === language
    ? workspaceLocale
    : DEFAULT_LANGUAGE_LOCALES[language];
}

export function buildFinancialReport(
  input: BuildFinancialReportInput,
): FinancialReportDTO {
  const { overview, timeZone } = input;
  const sections = new Set(input.sections);
  const windows = insightsWindows(
    overview.periodKey,
    "1m",
    timeZone,
    input.now,
  );
  const currency = overview.currency;
  const scoped = currentMoneyTransactions(input.transactions).filter(
    (transaction) =>
      transaction.currency === currency && transaction.status === "POSTED",
  );
  const inWindow = (date: Date, start: string, endExclusive: string) =>
    date >= new Date(start) && date < new Date(endExclusive);
  const current = scoped.filter((transaction) =>
    inWindow(
      transaction.occurredAt,
      overview.current.start,
      overview.current.endExclusive,
    ),
  );
  const previousCount = scoped.filter((transaction) =>
    inWindow(
      transaction.occurredAt,
      overview.previous.start,
      overview.previous.endExclusive,
    ),
  ).length;

  const categoriesById = new Map(
    input.categories.map((category) => [category.id, category]),
  );
  const merchantsById = new Map(
    input.merchants.map((merchant) => [merchant.id, merchant]),
  );
  const accountsById = new Map(
    input.accounts.map((account) => [account.id, account]),
  );
  const categoryName = (id: string | null) => {
    const category = id ? categoriesById.get(id) : undefined;
    return category ? localizeCategoryName(input.labels, category) : null;
  };

  const categoryItems = overview.categories.items.map(
    (item): ReportCategory => ({
      id: item.id,
      name: item.name,
      amountMinor: item.spendingMinor,
      previousMinor: item.previousSpendingMinor,
      shareBps: item.shareBps,
      changePercentage: percentageChange(
        BigInt(item.spendingMinor),
        BigInt(item.previousSpendingMinor),
      ),
      direction: direction(
        BigInt(item.spendingMinor) - BigInt(item.previousSpendingMinor),
      ),
      isUncategorized: item.isUncategorized,
      categoryKey: categoriesById.get(item.id)?.systemKey ?? null,
    }),
  );

  const recurring =
    sections.has("recurring") && input.recurring
      ? recurringSection(input.recurring, input.transactions, categoryName)
      : null;
  const priceIncrease = input.recurring?.priceChanges.find(
    (change) => change.flow === "OUTFLOW" && BigInt(change.deltaMinor) > 0n,
  );
  const topIncrease = overview.topChanges.find(
    (change) => change.dimension === "category" && change.direction === "up",
  );
  const topCategory = overview.categories.items.find(
    (item) => !item.isUncategorized,
  );
  const uncategorized = overview.categories.items.find(
    (item) => item.isUncategorized,
  );

  const income = reportMetric(overview.kpis.income);
  const spending = reportMetric(overview.kpis.spending);
  const net = reportMetric(overview.kpis.net);
  const ruleInput: ReportRuleInput = {
    income,
    spending,
    net,
    hasActivity: overview.hasActivity,
    topCategory: topCategory
      ? { name: topCategory.name, shareBps: topCategory.shareBps }
      : null,
    topCategoryIncrease: topIncrease
      ? {
          name: topIncrease.name,
          percentage: topIncrease.percentage,
          deltaMinor: topIncrease.deltaMinor,
        }
      : null,
    recurring: input.recurring
      ? {
          amountMinor: input.recurring.actual.spending.minor,
          shareBps: input.recurring.actual.shareBps,
          count: input.recurring.actual.paidCount,
          priceIncrease: priceIncrease
            ? {
                name: priceIncrease.name,
                percentage: priceIncrease.percentage,
                deltaMinor: priceIncrease.deltaMinor,
              }
            : null,
        }
      : null,
    uncategorized: uncategorized
      ? {
          amountMinor: uncategorized.spendingMinor,
          count: uncategorized.transactionCount,
        }
      : null,
    transferCount: overview.exclusions.transferCount,
    engineInsights: input.engineInsights,
  };

  const locale = overview.locale;
  return {
    meta: {
      version: 1,
      language: input.language,
      locale,
      timeZone,
      generatedAt: input.now.toISOString(),
      generatedDate: localDateKey(localDateForInstant(input.now, timeZone)),
      fileName: financialReportFileName(
        overview.periodKey,
        input.workspace.slug,
      ),
      pages: reportPages(input.sections),
    },
    workspace: { name: input.workspace.name, slug: input.workspace.slug },
    period: {
      key: overview.periodKey,
      firstDate: overview.current.firstDate,
      lastDate: overview.current.lastDate,
      monthLastDate: localDateKey(
        localDateForInstant(
          new Date(windows.currentFull.end.getTime() - 1),
          timeZone,
        ),
      ),
      isPartial: overview.current.isPartial,
      previous: {
        key: overviewPeriodKey(windows.previousFull, timeZone),
        firstDate: overview.previous.firstDate,
        lastDate: overview.previous.lastDate,
        isPartial: overview.previous.isPartial,
      },
    },
    currency: {
      code: currency,
      workspaceCurrency: overview.workspaceCurrency,
      excludedCurrencies: overview.currencies
        .filter(
          (option) => option.code !== currency && option.transactionCount > 0,
        )
        .map((option) => ({
          code: option.code,
          transactionCount: option.transactionCount,
        })),
    },
    hasActivity: overview.hasActivity,
    executiveSummary: {
      income,
      spending,
      net,
      transactions: countMetric(current.length, previousCount),
      highlights: reportHighlights(ruleInput),
    },
    incomeSpending: {
      months: overview.incomeVsSpending.map((bar) => ({
        month: bar.month,
        incomeMinor: bar.incomeMinor,
        spendingMinor: bar.spendingMinor,
        netMinor: (
          BigInt(bar.incomeMinor) - BigInt(bar.spendingMinor)
        ).toString(),
        isPartial: bar.isPartial,
        isReportMonth: bar.month === overview.periodKey,
      })),
    },
    categoryBreakdown: {
      totalMinor: overview.categories.totalMinor,
      items: categoryItems,
      other: overview.categories.other
        ? {
            amountMinor: overview.categories.other.spendingMinor,
            shareBps: overview.categories.other.shareBps,
            categoryCount: overview.categories.other.categoryCount,
          }
        : null,
      evolution: categoryItems.slice(0, CATEGORY_EVOLUTION_LIMIT),
    },
    keyTransactions: sections.has("transactions")
      ? {
          items: keyTransactions(
            current,
            (transaction) => ({
              merchantName: transaction.merchantId
                ? (merchantsById.get(transaction.merchantId)?.name ?? null)
                : null,
              categoryName: categoryName(transaction.categoryId),
              categoryKey: transaction.categoryId
                ? (categoriesById.get(transaction.categoryId)?.systemKey ??
                  null)
                : null,
              accountName: transaction.accountId
                ? (accountsById.get(transaction.accountId)?.name ?? null)
                : null,
              counterpartyAccountName: transaction.transferAccountId
                ? (accountsById.get(transaction.transferAccountId)?.name ??
                  null)
                : null,
            }),
            timeZone,
          ),
          totalCount: current.length,
        }
      : null,
    accounts:
      sections.has("accounts") && input.accountBalances
        ? accountsSection(input, currency)
        : null,
    recurring,
    insights: sections.has("insights")
      ? { items: reportInsights(ruleInput) }
      : null,
    recommendations: { items: reportRecommendations(ruleInput) },
  };
}

function reportMetric(metric: InsightsMetric): ReportMetric {
  return {
    minor: metric.minor,
    previousMinor: metric.previousMinor,
    deltaMinor: metric.deltaMinor,
    direction: metric.direction,
    sentiment: metric.sentiment,
    percentage: metric.percentage,
  };
}

function countMetric(current: number, previous: number): ReportCountMetric {
  return {
    current,
    previous,
    direction: direction(BigInt(current - previous)),
    percentage: percentageChange(BigInt(current), BigInt(previous)),
  };
}

function direction(delta: bigint): "up" | "down" | "neutral" {
  return delta > 0n ? "up" : delta < 0n ? "down" : "neutral";
}

type TransactionNames = Pick<
  ReportTransaction,
  | "merchantName"
  | "categoryName"
  | "categoryKey"
  | "accountName"
  | "counterpartyAccountName"
>;

export function keyTransactions(
  current: readonly LedgerUserFacingTransactionRecord[],
  names: (transaction: LedgerUserFacingTransactionRecord) => TransactionNames,
  timeZone: string,
  limit = KEY_TRANSACTION_LIMIT,
): ReportTransaction[] {
  return [...current]
    .sort(
      (left, right) =>
        (left.amountMinor > right.amountMinor
          ? -1
          : left.amountMinor < right.amountMinor
            ? 1
            : 0) ||
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit)
    .sort(
      (left, right) =>
        left.occurredAt.getTime() - right.occurredAt.getTime() ||
        left.id.localeCompare(right.id),
    )
    .map((transaction) => {
      const resolved = names(transaction);
      const signed =
        transaction.kind === "EXPENSE"
          ? -transaction.amountMinor
          : transaction.kind === "TRANSFER"
            ? 0n
            : transaction.amountMinor;
      return {
        id: transaction.id,
        date: localDateKey(
          localDateForInstant(transaction.occurredAt, timeZone),
        ),
        kind: transaction.kind,
        title:
          resolved.merchantName ??
          (transaction.kind === "TRANSFER" ? null : resolved.categoryName),
        ...resolved,
        amountMinor: transaction.amountMinor.toString(),
        signedMinor: signed.toString(),
      };
    });
}

function accountsSection(
  input: BuildFinancialReportInput,
  currency: string,
): NonNullable<FinancialReportDTO["accounts"]> {
  const balances = input.accountBalances ?? [];
  const analyses = balances
    .filter(({ account }) => account.currency === currency)
    .map(({ account, balance, openingBalance }) =>
      buildAccountAnalysis({
        transactions: input.transactions as readonly AccountLedgerEntry[],
        account,
        balance,
        openingBalance,
        workspaceCurrency: input.overview.workspaceCurrency,
        locale: input.overview.locale,
        timeZone: input.timeZone,
        range: "1m",
        periodKey: input.overview.periodKey,
        now: input.now,
        resolveName: input.resolveName,
        resolveAccountName: () => null,
      }),
    )
    .filter(
      (analysis) =>
        analysis.account.status === "ACTIVE" ||
        analysis.kpis.transactionCount.current > 0 ||
        analysis.balances.periodClosingMinor !== "0",
    );
  return {
    items: analyses
      .sort(
        (left, right) =>
          compareMinorDescending(
            left.balances.periodClosingMinor,
            right.balances.periodClosingMinor,
          ) || left.account.name.localeCompare(right.account.name),
      )
      .slice(0, REPORT_ACCOUNT_LIMIT)
      .map((analysis) => reportAccount(analysis, input.labels)),
    otherCurrencyCount: balances.filter(
      ({ account }) => account.currency !== currency && !account.archivedAt,
    ).length,
  };
}

function reportAccount(
  analysis: AccountAnalysis,
  labels: DashboardLabels,
): ReportAccount {
  const opening = BigInt(analysis.balances.periodOpeningMinor);
  const closing = BigInt(analysis.balances.periodClosingMinor);
  return {
    id: analysis.account.id,
    name: analysis.account.name,
    type: analysis.account.type,
    typeLabel: labels[ACCOUNT_TYPE_LABEL_KEYS[analysis.account.type]],
    openingMinor: opening.toString(),
    closingMinor: closing.toString(),
    balanceChangePercentage: percentageChange(closing, opening),
    balanceDirection: direction(closing - opening),
    inflowsMinor: analysis.kpis.inflows.minor,
    outflowsMinor: analysis.kpis.outflows.minor,
    netMinor: analysis.kpis.net.minor,
    transactionCount: analysis.kpis.transactionCount.current,
    isArchived: analysis.account.status === "ARCHIVED",
  };
}

function recurringSection(
  recurring: InsightsRecurring,
  transactions: readonly LedgerUserFacingTransactionRecord[],
  categoryName: (id: string | null) => string | null,
): NonNullable<FinancialReportDTO["recurring"]> {
  const byId = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );
  const items = recurring.topItems.outflows
    .filter((item) => BigInt(item.actualMinor) > 0n)
    .slice(0, RECURRING_ITEM_LIMIT)
    .map(
      (item): ReportRecurringItem => ({
        id: item.id,
        name: item.name,
        categoryName: item.latestTransactionId
          ? categoryName(byId.get(item.latestTransactionId)?.categoryId ?? null)
          : null,
        actualMinor: item.actualMinor,
        typicalAmountMinor: item.typicalAmountMinor,
        cadence: reportCadence(item.cadenceDays),
        cadenceDays: item.cadenceDays,
        paymentCount: item.paymentCount,
      }),
    );
  return {
    actualMinor: recurring.actual.spending.minor,
    totalSpendingMinor: recurring.actual.totalSpendingMinor,
    shareBps: recurring.actual.shareBps,
    paidCount: recurring.actual.paidCount,
    items,
    projection: {
      firstDate: recurring.upcoming.firstDate,
      lastDate: recurring.upcoming.lastDate,
      outflowMinor: recurring.upcoming.outflowMinor,
      occurrenceCount: recurring.upcoming.occurrenceCount,
      hasVariableAmounts: recurring.upcoming.hasVariableAmounts,
    },
  };
}

function compareMinorDescending(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a > b ? -1 : a < b ? 1 : 0;
}
