import type { AgentTransactionPeriod } from "@/modules/transactions/domain/agent-transaction-query";

import type { AccountReference } from "./account-reference";

export interface AgentAccountPeriodQuery {
  readonly period?: AgentTransactionPeriod;
  /** Calendar dates in the workspace timezone; ignored when a period is given. */
  readonly from?: string;
  readonly to?: string;
}

export interface AgentAccountMovementsQuery extends AccountReference, AgentAccountPeriodQuery {
  readonly limit: number;
}

export interface AgentAccountComparisonQuery extends AgentAccountPeriodQuery {
  readonly includeArchived: boolean;
}

export interface AgentAccountSpendabilityQuery extends AccountReference {
  readonly amountText: string;
}
