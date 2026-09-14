import type { LedgerTransactionKind } from "@/modules/ledger/domain";

export const AGENT_ACTION_STATUSES = [
  "DRAFT",
  "WAITING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
] as const;
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];

export const AGENT_ACTION_TYPES = ["TRANSACTION_CREATE"] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const TRANSACTION_DRAFT_KINDS = ["EXPENSE", "INCOME", "TRANSFER"] as const;
export type TransactionDraftKind = (typeof TRANSACTION_DRAFT_KINDS)[number];

export interface TransactionDraft {
  readonly kind: TransactionDraftKind;
  /** Exact minor units, serialized because JSON has no bigint. */
  readonly amountMinor: string | null;
  /** The workspace currency, resolved on the server and never supplied by the browser or model. */
  readonly currency: string;
  readonly occurredAt: string | null;
  readonly accountId: string | null;
  readonly transferAccountId: string | null;
  readonly categoryId: string | null;
  readonly merchantName: string | null;
  readonly note: string | null;
  /** Original natural-language amount for an editable draft; it is parsed server-side. */
  readonly amountText: string | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly TransactionDraftField[];
}

export const TRANSACTION_DRAFT_FIELDS = [
  "amount",
  "date",
  "account",
  "destinationAccount",
  "category",
] as const;
export type TransactionDraftField = (typeof TRANSACTION_DRAFT_FIELDS)[number];

export interface AgentActionResult {
  readonly transactionId: string;
  readonly kind: Extract<LedgerTransactionKind, TransactionDraftKind>;
  readonly verifiedAt: string;
}

export interface AgentActionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: AgentActionType;
  readonly status: AgentActionStatus;
  readonly initiatedByUserId: string;
  readonly approvedByUserId: string | null;
  readonly draft: TransactionDraft;
  readonly result: AgentActionResult | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly idempotencyKey: string;
  readonly eveSessionId: string | null;
  readonly eveCallId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentActionAuditRecord {
  readonly id: string;
  readonly actionId: string;
  readonly workspaceId: string;
  readonly actorUserId: string | null;
  readonly event: string;
  readonly fromStatus: AgentActionStatus | null;
  readonly toStatus: AgentActionStatus | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export function isTransactionDraftReady(draft: TransactionDraft): boolean {
  if (!draft.amountMinor || !draft.occurredAt || !draft.accountId) return false;

  if (draft.kind === "TRANSFER") {
    return Boolean(draft.transferAccountId && draft.transferAccountId !== draft.accountId);
  }

  return Boolean(draft.categoryId);
}
