import type { InboxReason } from "./domain";

export const AGENT_INBOX_OPERATIONS = [
  "ACCEPT_SUGGESTION",
  "CHOOSE_CATEGORY",
  "CONFIRM_RECURRING",
  "IGNORE_RECURRING",
] as const;
export type AgentInboxOperation = (typeof AGENT_INBOX_OPERATIONS)[number];

export const AGENT_INBOX_FILTERS = [
  "ALL",
  "UNKNOWN_CATEGORY",
  "CLASSIFICATION_REVIEW",
  "POSSIBLE_RECURRING",
  "MERCHANT_AMBIGUITY",
  "POSSIBLE_TRANSFER",
] as const satisfies readonly ("ALL" | InboxReason)[];
export type AgentInboxFilter = (typeof AGENT_INBOX_FILTERS)[number];

export interface AgentInboxListQuery {
  readonly reason: AgentInboxFilter;
  readonly limit: number;
}

export interface AgentInboxReference {
  readonly inboxItemId?: string | null;
  readonly merchantName?: string | null;
}

export function isCategoryInboxOperation(
  operation: AgentInboxOperation,
): operation is "ACCEPT_SUGGESTION" | "CHOOSE_CATEGORY" {
  return operation === "ACCEPT_SUGGESTION" || operation === "CHOOSE_CATEGORY";
}

export function inboxOperationFitsReason(operation: AgentInboxOperation, reason: InboxReason): boolean {
  if (isCategoryInboxOperation(operation)) return reason === "UNKNOWN_CATEGORY" || reason === "CLASSIFICATION_REVIEW";
  return reason === "POSSIBLE_RECURRING";
}

/** MERCHANT_AMBIGUITY and POSSIBLE_TRANSFER have no canonical settlement rule, so nothing may resolve them. */
export function inboxReasonHasResolution(reason: InboxReason): boolean {
  return reason !== "MERCHANT_AMBIGUITY" && reason !== "POSSIBLE_TRANSFER";
}
