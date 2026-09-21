import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { calendarMonthPeriod } from "@/money/period";
import { resolveMerchantLogo } from "@/lib/transaction-visuals/merchant-logo-matcher";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { isUserFacingLedgerTransaction, type LedgerTransactionRecord } from "@/modules/ledger/domain";
import { currentFinancialTransactions } from "@/modules/ledger/correction-chain";
import { getLedgerService } from "@/modules/ledger/server";
import { buildOverviewFinancialSummary } from "@/modules/overview/domain/overview-financial-summary";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

export type AssistantReadScope = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
};

export type AssistantPeriod = "CURRENT_MONTH" | "PREVIOUS_MONTH";

type WorkspaceAssistantContext = {
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
};

export async function getAssistantOverviewSummary(
  scope: AssistantReadScope,
  period: AssistantPeriod = "CURRENT_MONTH",
) {
  const context = await requireAssistantWorkspaceContext(scope);
  const selectedPeriod = selectedCalendarMonth(period, context.timeZone);
  const historyStart = calendarMonthPeriod(selectedPeriod.start, context.timeZone, -3).start;
  const transactions = await getLedgerService().listTransactions(scope.actor, scope.workspaceId, {
    occurredFrom: historyStart,
    occurredTo: new Date(selectedPeriod.end.getTime() - 1),
  });
  const summary = buildOverviewFinancialSummary({
    filter: "ALL",
    currency: context.currency,
    locale: context.locale,
    period: selectedPeriod,
    timeZone: context.timeZone,
    now: new Date(),
    transactions: transactions.filter(isUserFacingLedgerTransaction),
  });

  return {
    period: period === "CURRENT_MONTH" ? "current-month" : "previous-month",
    currency: context.currency,
    locale: context.locale,
    timeZone: context.timeZone,
    spending: summary.primary,
    pace: summary.pace,
    expectedMonth: summary.expectedMonth,
  };
}

export async function getAssistantRecentTransactions(scope: AssistantReadScope, limit = 5) {
  const context = await requireAssistantWorkspaceContext(scope);
  const safeLimit = clampLimit(limit, 1, 20);
  const ledger = getLedgerService();
  const transactions = currentFinancialTransactions(
    await ledger.listTransactions(scope.actor, scope.workspaceId),
  ).slice(0, safeLimit);
  return {
    currency: context.currency,
    transactions: await presentAssistantTransactions(scope, transactions),
  };
}

export async function getAssistantExpenses(
  scope: AssistantReadScope,
  input: { readonly period?: AssistantPeriod; readonly limit?: number } = {},
) {
  const context = await requireAssistantWorkspaceContext(scope);
  const selectedPeriod = selectedCalendarMonth(input.period ?? "CURRENT_MONTH", context.timeZone);
  const ledger = getLedgerService();
  const transactions = await ledger.listTransactions(scope.actor, scope.workspaceId, {
    statuses: ["POSTED"],
    occurredFrom: selectedPeriod.start,
    occurredTo: new Date(selectedPeriod.end.getTime() - 1),
  });
  const expenses = currentFinancialTransactions(transactions)
    .filter((transaction) => transaction.kind === "EXPENSE")
    .sort((left, right) => (left.amountMinor === right.amountMinor ? 0 : left.amountMinor > right.amountMinor ? -1 : 1))
    .slice(0, clampLimit(input.limit ?? 5, 1, 20));

  return {
    period: input.period ?? "CURRENT_MONTH",
    currency: context.currency,
    expenses: await presentAssistantTransactions(scope, expenses),
  };
}

export async function getAssistantInboxItems(scope: AssistantReadScope, limit = 5) {
  await requireAssistantWorkspaceContext(scope);
  const inbox = await getFinancialInboxService().listInbox(scope.actor, scope.workspaceId);
  return {
    unresolvedCount: inbox.filter((item) => item.status === "OPEN").length,
    items: inbox.slice(0, clampLimit(limit, 1, 20)),
  };
}

export async function getAssistantRecurringPayments(scope: AssistantReadScope, limit = 10) {
  await requireAssistantWorkspaceContext(scope);
  const payments = await getFinancialInboxService().listRecurring(scope.actor, scope.workspaceId);
  return { payments: payments.slice(0, clampLimit(limit, 1, 20)) };
}

async function requireAssistantWorkspaceContext(scope: AssistantReadScope): Promise<WorkspaceAssistantContext> {
  const memberContext = await new DatabaseWorkspaceRepository().findMemberContext(
    scope.workspaceId,
    scope.actor.userId,
  );
  if (!memberContext) throw new AuthorizationError("You are not a member of this workspace.");
  return {
    currency: memberContext.preferences.currency,
    locale: memberContext.preferences.locale,
    timeZone: memberContext.preferences.timezone,
  };
}

function selectedCalendarMonth(period: AssistantPeriod, timeZone: string) {
  return calendarMonthPeriod(new Date(), timeZone, period === "PREVIOUS_MONTH" ? -1 : 0);
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

async function presentAssistantTransactions(
  scope: AssistantReadScope,
  transactions: readonly LedgerTransactionRecord[],
) {
  const ledger = getLedgerService();
  const [categories, merchants] = await Promise.all([
    ledger.listCategories(scope.actor, scope.workspaceId),
    ledger.listMerchants(scope.actor, scope.workspaceId),
  ]);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const merchantsById = new Map(merchants.map((merchant) => [merchant.id, merchant]));

  return transactions.map((transaction) => {
    const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
    const merchant = transaction.merchantId ? merchantsById.get(transaction.merchantId) : null;
    const merchantName = merchant?.name ?? transaction.note?.trim() ?? (transaction.kind === "TRANSFER" ? "Transfer" : "Transaction");
    const icon = resolveTransactionIcon({
      merchantName,
      categoryName: category?.name,
      categoryKey: category?.systemKey,
      transactionKind: transaction.kind,
    });
    const merchantLogo = resolveMerchantLogo({ merchantName });

    return {
      id: transaction.id,
      merchantName,
      amount: { minorUnits: transaction.amountMinor.toString(), currency: transaction.currency },
      kind: transaction.kind,
      categoryName: category?.name ?? null,
      categoryKey: category?.systemKey ?? null,
      iconKey: icon.iconKey,
      merchantLogoKey: merchantLogo?.key ?? null,
      occurredAt: transaction.occurredAt.toISOString(),
      status: transaction.status,
    };
  });
}
