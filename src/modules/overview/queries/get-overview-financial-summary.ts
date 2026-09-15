import type { AuthenticatedActor } from "@/authorization/session";
import type { MoneyTransaction } from "@/money";
import { calendarMonthPeriod, type Period } from "@/money/period";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";

import { buildOverviewFinancialSummary } from "../domain/overview-financial-summary";
import type { OverviewFilter } from "../domain/overview.types";

export interface GetOverviewFinancialSummaryInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly filter: OverviewFilter;
  readonly period: Period;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly now?: Date;
}


export async function getOverviewFinancialSummary(input: GetOverviewFinancialSummaryInput) {
  const historyStart = calendarMonthPeriod(input.period.start, input.timeZone, -3).start;
  const transactions = await new DatabaseLedgerRepository().listTransactions(input.workspaceId, {
    occurredFrom: historyStart,
    occurredTo: new Date(input.period.end.getTime() - 1),
  });

  return buildOverviewFinancialSummary({
    filter: input.filter,
    currency: input.currency,
    locale: input.locale,
    period: input.period,
    timeZone: input.timeZone,
    now: input.now ?? new Date(),
    transactions: transactions satisfies readonly MoneyTransaction[],
  });
}
