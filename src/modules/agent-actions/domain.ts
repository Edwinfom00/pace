import type { LedgerTransactionKind } from "@/modules/ledger/domain";
import type { BudgetScope, BudgetStatus, SavingsGoalStatus } from "@/modules/plans/domain";

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

export const AGENT_ACTION_TYPES = [
  "TRANSACTION_CREATE",
  "BUDGET_CREATE",
  "BUDGET_UPDATE",
  "SAVINGS_GOAL_CREATE",
  "SAVINGS_GOAL_UPDATE",
] as const;
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

export interface BudgetDraft {
  readonly planType: "BUDGET";
  readonly operation: "CREATE" | "UPDATE";
  readonly budgetId: string | null;
  readonly scope: BudgetScope | null;
  readonly categoryId: string | null;
  /** Exact minor units, serialized because JSON has no bigint. */
  readonly amountMinor: string | null;
  readonly amountText: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: BudgetStatus | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly BudgetDraftField[];
}

export const BUDGET_DRAFT_FIELDS = ["budget", "amount", "category", "period"] as const;
export type BudgetDraftField = (typeof BUDGET_DRAFT_FIELDS)[number];

export interface SavingsGoalDraft {
  readonly planType: "SAVINGS_GOAL";
  readonly operation: "CREATE" | "UPDATE";
  readonly goalId: string | null;
  readonly name: string | null;
  readonly targetAmountMinor: string | null;
  readonly targetAmountText: string | null;
  readonly currentSavedMinor: string | null;
  readonly currentSavedText: string | null;
  readonly targetDate: string | null;
  readonly status: SavingsGoalStatus | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly SavingsGoalDraftField[];
}

export const SAVINGS_GOAL_DRAFT_FIELDS = ["goal", "name", "targetAmount", "currentSaved", "targetDate"] as const;
export type SavingsGoalDraftField = (typeof SAVINGS_GOAL_DRAFT_FIELDS)[number];

export type PlanDraft = BudgetDraft | SavingsGoalDraft;
export type AgentActionDraft = TransactionDraft | PlanDraft;

export const TRANSACTION_DRAFT_FIELDS = [
  "amount",
  "date",
  "account",
  "destinationAccount",
  "category",
] as const;
export type TransactionDraftField = (typeof TRANSACTION_DRAFT_FIELDS)[number];

export interface TransactionActionResult {
  readonly transactionId: string;
  readonly kind: Extract<LedgerTransactionKind, TransactionDraftKind>;
  readonly verifiedAt: string;
}

export interface PlanActionResult {
  readonly planType: PlanDraft["planType"];
  readonly planId: string;
  readonly operation: PlanDraft["operation"];
  readonly verifiedAt: string;
}

export type AgentActionResult = TransactionActionResult | PlanActionResult;

export interface AgentActionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: AgentActionType;
  readonly status: AgentActionStatus;
  readonly initiatedByUserId: string;
  readonly approvedByUserId: string | null;
  readonly draft: AgentActionDraft;
  readonly result: AgentActionResult | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly idempotencyKey: string;
  readonly eveSessionId: string | null;
  readonly eveCallId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type TransactionAgentActionRecord = AgentActionRecord & {
  readonly type: "TRANSACTION_CREATE";
  readonly draft: TransactionDraft;
  readonly result: TransactionActionResult | null;
};

export type PlanAgentActionRecord = AgentActionRecord & {
  readonly type: Exclude<AgentActionType, "TRANSACTION_CREATE">;
  readonly draft: PlanDraft;
  readonly result: PlanActionResult | null;
};

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

export function isPlanDraftReady(draft: PlanDraft): boolean {
  if (draft.operation === "UPDATE" && !(draft.planType === "BUDGET" ? draft.budgetId : draft.goalId)) {
    return false;
  }
  if (draft.planType === "BUDGET") {
    return Boolean(
      draft.scope &&
      draft.amountMinor &&
      draft.startsOn &&
      (draft.scope === "OVERALL" || draft.categoryId),
    );
  }
  return Boolean(draft.name && draft.targetAmountMinor && draft.currentSavedMinor !== null);
}

export function isAgentActionDraftReady(draft: AgentActionDraft): boolean {
  return "kind" in draft ? isTransactionDraftReady(draft) : isPlanDraftReady(draft);
}

export function isTransactionAction(action: AgentActionRecord): action is TransactionAgentActionRecord {
  return action.type === "TRANSACTION_CREATE" && "kind" in action.draft;
}

export function isPlanAction(action: AgentActionRecord): action is PlanAgentActionRecord {
  return action.type !== "TRANSACTION_CREATE" && "planType" in action.draft;
}
