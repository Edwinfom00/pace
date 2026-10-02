import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import type { InsightCandidate } from "@/money/insights";
import { createNameResolver } from "@/modules/insights/overview/get-insights-overview";
import { presentDeterministicInsights } from "@/modules/insights/overview/insights-deterministic";
import {
  buildInsightsOverview,
  insightsWindows,
} from "@/modules/insights/overview/insights-overview";
import type { InsightsDeterministicItem } from "@/modules/insights/overview/insights-overview.types";
import {
  buildInsightsRecurring,
  type RecurringAnalyticsCorrection,
  type RecurringAnalyticsPayment,
} from "@/modules/insights/recurring/insights-recurring";
import { DEFAULT_RECURRING_HORIZON } from "@/modules/insights/recurring/insights-recurring.types";
import {
  isUserFacingLedgerTransaction,
  type LedgerAccountBalance,
  type LedgerAccountRecord,
  type LedgerCategoryRecord,
  type LedgerMerchantRecord,
  type LedgerOpeningBalanceReadRecord,
  type LedgerTransactionRecord,
} from "@/modules/ledger/domain";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";

import type {
  FinancialReportDTO,
  FinancialReportRequest,
} from "../domain/financial-report.types";
import {
  buildFinancialReport,
  reportLocale,
  type ReportAccountBalanceInput,
} from "./build-financial-report";

export interface FinancialReportReaders {
  readonly findMembership: (
    workspaceId: string,
    userId: string,
  ) => Promise<WorkspaceMembershipRecord | null>;
  readonly listTransactions: (
    workspaceId: string,
  ) => Promise<LedgerTransactionRecord[]>;
  readonly listCategories: (
    workspaceId: string,
  ) => Promise<LedgerCategoryRecord[]>;
  readonly listMerchants: (
    workspaceId: string,
  ) => Promise<LedgerMerchantRecord[]>;
  readonly listAccounts: (
    workspaceId: string,
  ) => Promise<LedgerAccountRecord[]>;
  readonly getAccountBalance: (
    workspaceId: string,
    accountId: string,
  ) => Promise<LedgerAccountBalance | null>;
  readonly findOpeningBalance: (
    workspaceId: string,
    accountId: string,
  ) => Promise<LedgerOpeningBalanceReadRecord | null>;
  readonly listCorrections: (
    workspaceId: string,
  ) => Promise<readonly RecurringAnalyticsCorrection[]>;
  readonly listRecurringPayments: (
    workspaceId: string,
  ) => Promise<readonly RecurringAnalyticsPayment[]>;
  readonly previewInsights: (
    actor: AuthenticatedActor,
    workspaceId: string,
    input: { readonly asOf: Date; readonly currency: string },
  ) => Promise<InsightCandidate[]>;
}

export interface GetFinancialReportInput extends FinancialReportRequest {
  readonly actor: AuthenticatedActor;
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly workspaceCurrency: string;
  readonly workspaceLocale: string;
  readonly timeZone: string;
  readonly now: Date;
}

export async function getFinancialReportWithReaders(
  input: GetFinancialReportInput,
  readers: FinancialReportReaders,
): Promise<FinancialReportDTO> {
  const workspaceId = input.workspace.id;
  const membership = await readers.findMembership(
    workspaceId,
    input.actor.userId,
  );
  if (!membership)
    throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const sections = new Set(input.sections);
  const [
    transactions,
    categories,
    merchants,
    accounts,
    corrections,
    recurringPayments,
  ] = await Promise.all([
    readers.listTransactions(workspaceId),
    readers.listCategories(workspaceId),
    readers.listMerchants(workspaceId),
    readers.listAccounts(workspaceId),
    readers.listCorrections(workspaceId),
    readers.listRecurringPayments(workspaceId),
  ]);
  const labels = getDashboardLabels(input.language);
  const locale = reportLocale(input.language, input.workspaceLocale);
  const resolveName = createNameResolver(labels, categories, merchants);
  const userFacing = transactions.filter(isUserFacingLedgerTransaction);
  const workspaceAccounts = accounts.filter(
    (account) => account.workspaceId === workspaceId,
  );

  const overview = buildInsightsOverview({
    transactions: userFacing,
    requestedCurrency: input.currency,
    workspaceCurrency: input.workspaceCurrency,
    locale,
    timeZone: input.timeZone,
    range: "1m",
    periodKey: input.periodKey,
    now: input.now,
    resolveName,
  });

  const recurring = buildInsightsRecurring({
    transactions: userFacing,
    merchants,
    corrections,
    recurringPayments,
    requestedCurrency: overview.currency,
    workspaceCurrency: input.workspaceCurrency,
    locale,
    timeZone: input.timeZone,
    range: "1m",
    horizon: DEFAULT_RECURRING_HORIZON,
    periodKey: overview.periodKey,
    now: input.now,
  });

  const [engineInsights, accountBalances] = await Promise.all([
    readEngineInsights(
      input,
      readers,
      overview.periodKey,
      overview.currency,
      labels,
      resolveName,
    ),
    sections.has("accounts")
      ? readAccountBalances(workspaceId, workspaceAccounts, readers)
      : Promise.resolve(null),
  ]);

  return buildFinancialReport({
    overview,
    engineInsights,
    recurring,
    accountBalances,
    transactions: userFacing,
    categories,
    merchants,
    accounts: workspaceAccounts,
    labels,
    resolveName,
    workspace: { name: input.workspace.name, slug: input.workspace.slug },
    language: input.language,
    timeZone: input.timeZone,
    sections: input.sections,
    now: input.now,
  });
}

async function readEngineInsights(
  input: GetFinancialReportInput,
  readers: FinancialReportReaders,
  periodKey: string,
  currency: string,
  labels: ReturnType<typeof getDashboardLabels>,
  resolveName: ReturnType<typeof createNameResolver>,
): Promise<InsightsDeterministicItem[]> {
  const anchorMonth = insightsWindows(
    periodKey,
    "1m",
    input.timeZone,
    input.now,
  ).currentFull;
  if (input.now < anchorMonth.start) return [];
  const asOf =
    input.now < anchorMonth.end
      ? input.now
      : new Date(anchorMonth.end.getTime() - 1);
  try {
    const candidates = await readers.previewInsights(
      input.actor,
      input.workspace.id,
      { asOf, currency },
    );
    return presentDeterministicInsights({
      candidates,
      labels,
      locale: reportLocale(input.language, input.workspaceLocale),
      timeZone: input.timeZone,
      workspaceSlug: input.workspace.slug,
      resolveName,
    });
  } catch (error) {
    console.error(
      "[reports] Deterministic insights unavailable for financial report",
      error,
    );
    return [];
  }
}

async function readAccountBalances(
  workspaceId: string,
  accounts: readonly LedgerAccountRecord[],
  readers: FinancialReportReaders,
): Promise<ReportAccountBalanceInput[]> {
  const entries = await Promise.all(
    accounts.map(async (account) => {
      const [balance, opening] = await Promise.all([
        readers.getAccountBalance(workspaceId, account.id),
        readers.findOpeningBalance(workspaceId, account.id),
      ]);
      if (!balance || balance.currency !== account.currency) {
        throw new Error(
          "Canonical account balance currency does not match the account currency.",
        );
      }
      return {
        account,
        balance: {
          currentBalanceMinor: balance.currentBalanceMinor,
          availableBalanceMinor: balance.availableBalanceMinor,
          spendabilityMode: balance.spendabilityMode,
        },
        openingBalance:
          opening &&
          opening.transaction.status === "POSTED" &&
          opening.transaction.currency === account.currency
            ? {
                amountMinor: opening.transaction.amountMinor,
                occurredAt: opening.transaction.occurredAt,
              }
            : null,
      };
    }),
  );
  return entries;
}
