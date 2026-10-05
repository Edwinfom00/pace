export const AGENT_TRANSACTION_PERIODS = [
  "TODAY",
  "YESTERDAY",
  "THIS_WEEK",
  "LAST_WEEK",
  "THIS_MONTH",
  "LAST_MONTH",
] as const;
export type AgentTransactionPeriod = (typeof AGENT_TRANSACTION_PERIODS)[number];

export const AGENT_TRANSACTION_KINDS = ["EXPENSE", "INCOME", "TRANSFER", "REFUND"] as const;
export type AgentTransactionKind = (typeof AGENT_TRANSACTION_KINDS)[number];

export interface AgentTransactionSearchQuery {
  readonly period?: AgentTransactionPeriod;
  /** Calendar dates in the workspace timezone; ignored when a period is given. */
  readonly from?: string;
  readonly to?: string;
  readonly kind?: AgentTransactionKind;
  readonly search?: string;
  readonly amountText?: string;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly limit: number;
}
