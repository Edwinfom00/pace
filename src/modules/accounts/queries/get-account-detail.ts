import { AuthorizationError } from "@/authorization/errors";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { AuthenticatedActor } from "@/authorization/session";
import { calendarMonthPeriod, localDateForInstant } from "@/money/period";
import {
  DatabaseLedgerRepository,
  type LedgerAccountDetailRecentTransactionRow,
} from "@/modules/ledger/repositories/ledger-repository";
import { getLedgerService } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  accountDetailChartPeriod,
  type AccountDetail,
  type AccountDetailChartRange,
  type AccountDetailRecentTransaction,
} from "../domain/account-detail";

export type GetAccountDetailInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly accountId: string;
  readonly chartRange: AccountDetailChartRange;
  readonly timeZone: string;
  readonly now?: Date;
};



export async function getAccountDetail(input: GetAccountDetailInput): Promise<AccountDetail | null> {
  const workspaces = new DatabaseWorkspaceRepository();
  const membership = await workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const repository = new DatabaseLedgerRepository();
  const account = await repository.findAccount(input.workspaceId, input.accountId);
  if (!account) return null;

  const now = input.now ?? new Date();
  const summaryPeriod = calendarMonthPeriod(now, input.timeZone);
  const chartPeriod = accountDetailChartPeriod(input.chartRange, now, input.timeZone);
  const [balance, openingBalance, summary, balanceDeltas, categoryTotals, recentRows, capabilities] = await Promise.all([
    getLedgerService().getAccountBalance(input.actor, {
      workspaceId: input.workspaceId,
      accountId: input.accountId,
    }),
    repository.findOpeningBalance(input.workspaceId, input.accountId),
    repository.getAccountDetailMovementSummary({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      periodStart: summaryPeriod.start,
      periodEnd: summaryPeriod.end,
    }),
    repository.getAccountDetailBalanceDeltas({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      chartStart: chartPeriod.start,
      chartEnd: chartPeriod.end,
      timeZone: input.timeZone,
    }),
    repository.getAccountDetailTopExpenseCategories({
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      periodStart: summaryPeriod.start,
      periodEnd: summaryPeriod.end,
      limit: 5,
    }),
    repository.listAccountDetailRecentTransactions(input.workspaceId, input.accountId, 5),
    getLedgerService().getAccountActionPolicy(input.actor, input.workspaceId, input.accountId),
  ]);

  if (balance.currency !== account.currency) {
    throw new Error("Canonical account balance currency does not match the account currency.");
  }
  if (summary.hasCurrencyMismatch) {
    throw new Error("This account contains movements in an incompatible currency.");
  }

  return {
    account: {
      id: account.id,
      name: account.name,
      type: account.type,
      currency: account.currency,
      status: account.archivedAt ? "ARCHIVED" : "ACTIVE",
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    },
    capabilities,
    currentBalanceMinor: balance.currentBalanceMinor.toString(),
    availableBalanceMinor: balance.availableBalanceMinor.toString(),
    openingBalance: openingBalance
      ? {
        amountMinor: openingBalance.transaction.amountMinor.toString(),
        currency: openingBalance.transaction.currency,
        effectiveAt: openingBalance.transaction.occurredAt.toISOString(),
        hasBeenCorrected: openingBalance.currentTransactionId !== openingBalance.originalTransactionId,
        updatedAt: openingBalance.transaction.updatedAt.toISOString(),
      }
      : null,
    summary: {
      inflowsMinor: summary.inflowsMinor.toString(),
      outflowsMinor: summary.outflowsMinor.toString(),
      netTransfersMinor: summary.netTransfersMinor.toString(),
      transactionCount: summary.transactionCount,
    },
    chart: {
      range: input.chartRange,
      points: buildChartPoints({
        deltas: balanceDeltas,
        chartPeriod,
        timeZone: input.timeZone,
      }),
    },
    topCategories: categoryTotals.map((category) => ({
      id: category.id,
      name: category.name,
      amountMinor: category.amountMinor.toString(),
      percentage: category.totalMinor > 0n
        ? Number((category.amountMinor * 100n) / category.totalMinor)
        : 0,
    })),
    recentTransactions: recentRows.map((row) => mapRecentTransaction(row, input.accountId)),
  };
}

function buildChartPoints({
  deltas,
  chartPeriod,
  timeZone,
}: {
  readonly deltas: readonly { readonly date: string | null; readonly movementMinor: bigint }[];
  readonly chartPeriod: { readonly start: Date; readonly end: Date };
  readonly timeZone: string;
}) {
  const movementByDate = new Map<string, bigint>();
  let openingMovementMinor = 0n;
  for (const delta of deltas) {
    if (delta.date === null) openingMovementMinor = delta.movementMinor;
    else movementByDate.set(delta.date, delta.movementMinor);
  }

  const points: { date: string; balanceMinor: string }[] = [];
  let balanceMinor = openingMovementMinor;
  const start = localDateForInstant(chartPeriod.start, timeZone);
  const end = localDateForInstant(chartPeriod.end, timeZone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const endCursor = Date.UTC(end.year, end.month - 1, end.day);
  while (cursor.getTime() < endCursor) {
    const date = `${cursor.getUTCFullYear().toString().padStart(4, "0")}-${(cursor.getUTCMonth() + 1).toString().padStart(2, "0")}-${cursor.getUTCDate().toString().padStart(2, "0")}`;
    balanceMinor += movementByDate.get(date) ?? 0n;
    points.push({ date, balanceMinor: balanceMinor.toString() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return points;
}

function mapRecentTransaction(
  row: LedgerAccountDetailRecentTransactionRow,
  accountId: string,
): AccountDetailRecentTransaction {
  const transaction = row.transaction;
  const isOutgoingTransfer = transaction.kind === "TRANSFER" && transaction.accountId === accountId;
  const isIncomingTransfer = transaction.kind === "TRANSFER" && transaction.transferAccountId === accountId;
  const movementMinor = isOutgoingTransfer || transaction.kind === "EXPENSE"
    ? -transaction.amountMinor
    : transaction.amountMinor;

  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    amountMinor: transaction.amountMinor.toString(),
    movementMinor: movementMinor.toString(),
    occurredAt: transaction.occurredAt.toISOString(),
    merchantName: row.merchant?.name ?? null,
    note: transaction.note,
    category: row.category
      ? { key: row.category.systemKey ?? row.category.id, label: row.category.name }
      : null,
    transferCounterpartyName: isOutgoingTransfer
      ? row.destinationAccount?.name ?? null
      : isIncomingTransfer
        ? row.sourceAccount?.name ?? null
        : null,
    movementDirection: movementMinor < 0n ? "OUTFLOW" : "INFLOW",
  };
}
