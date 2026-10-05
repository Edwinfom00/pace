import "server-only";

import type { AuthenticatedActor } from "@/authorization/session";
import type { MoneyTransaction } from "@/money";
import { calendarMonthPeriod } from "@/money/period";
import { getAccountsOverview } from "@/modules/accounts/queries/get-accounts-overview";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";
import { isUserFacingLedgerTransaction } from "@/modules/ledger/domain";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import {
  buildOverviewFinancialSummary,
  overviewPeriodFromKey,
} from "@/modules/overview/domain/overview-financial-summary";
import { buildOverviewUpcomingBills } from "@/modules/overview/domain/overview-right-rail";
import type { OverviewMetric } from "@/modules/overview/domain/overview.types";

import type {
  AssistantSnapshot,
  AssistantSnapshotMetric,
} from "../domain/assistant-snapshot";

export async function getAssistantSnapshot({
  actor,
  workspaceId,
  currency,
  locale,
  timeZone,
  now = new Date(),
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly now?: Date;
}): Promise<AssistantSnapshot> {
  const period = overviewPeriodFromKey(undefined, timeZone, now);
  const inbox = getFinancialInboxService();

  const [transactions, accounts, inboxPreview, recurring] =
    await Promise.allSettled([
      new DatabaseLedgerRepository().listTransactions(workspaceId, {
        occurredFrom: calendarMonthPeriod(period.start, timeZone, -3).start,
        occurredTo: new Date(period.end.getTime() - 1),
      }),
      getAccountsOverview({ actor, workspaceId, filter: "ACTIVE" }),
      inbox.listInboxPreview(actor, workspaceId, 1),
      inbox.listRecurring(actor, workspaceId),
    ]);

  let spending: AssistantSnapshotMetric | null = null;
  let income: AssistantSnapshotMetric | null = null;
  if (transactions.status === "fulfilled") {
    const summarize = (filter: "EXPENSE" | "INCOME") =>
      buildOverviewFinancialSummary({
        filter,
        currency,
        locale,
        period,
        timeZone,
        now,
        transactions: transactions.value.filter(
          isUserFacingLedgerTransaction,
        ) satisfies readonly MoneyTransaction[],
      }).primary;
    spending = toMetric(summarize("EXPENSE"));
    income = toMetric(summarize("INCOME"));
  }

  // A total is only shown when every active account shares the workspace currency; mixed currencies have no safe sum.
  const summary = accounts.status === "fulfilled" ? accounts.value.summary : [];
  const balance =
    summary.length === 1 && summary[0]!.currency === currency
      ? {
          minor: summary[0]!.currentBalanceMinor,
          accountCount: summary[0]!.accountCount,
        }
      : null;

  return {
    currency,
    locale,
    timeZone,
    periodStart: period.start.toISOString(),
    balance,
    spending,
    income,
    inboxCount:
      inboxPreview.status === "fulfilled"
        ? inboxPreview.value.unresolvedCount
        : null,
    upcoming:
      recurring.status === "fulfilled"
        ? buildOverviewUpcomingBills(recurring.value, timeZone, now, 3).map(
            (bill) => ({
              recurringId: bill.recurringId,
              name: bill.merchantName,
              nextExpectedAt: bill.nextExpectedAt,
              amountMinor: bill.amountMinor,
              currency: bill.currency,
            }),
          )
        : [],
  };
}

function toMetric(metric: OverviewMetric): AssistantSnapshotMetric | null {
  return metric.availability === "value" && metric.minor !== null
    ? { minor: metric.minor, trend: metric.trend ?? null }
    : null;
}
