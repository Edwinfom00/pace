import type { AgentInboxOperation } from "@/modules/financial-inbox/agent-inbox-query";
import type {
  InboxItemStatus,
  InboxReason,
  RecurringPaymentDirection,
  RecurringPaymentLifecycle,
  RecurringPaymentOrigin,
  RecurringPaymentStatus,
} from "@/modules/financial-inbox/domain";
import type { LedgerAccountType, LedgerTransactionKind } from "@/modules/ledger/domain";
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
  "TRANSACTION_UPDATE",
  "TRANSACTION_CORRECT",
  "ACCOUNT_CREATE",
  "ACCOUNT_MANAGE",
  "RECURRING_CREATE",
  "RECURRING_MANAGE",
  "INBOX_RESOLVE",
] as const;
export type AgentActionType = (typeof AGENT_ACTION_TYPES)[number];

export const TRANSACTION_CHANGE_ACTION_TYPES = ["TRANSACTION_UPDATE", "TRANSACTION_CORRECT"] as const;
export type TransactionChangeActionType = (typeof TRANSACTION_CHANGE_ACTION_TYPES)[number];
export const ACCOUNT_ACTION_TYPES = ["ACCOUNT_CREATE", "ACCOUNT_MANAGE"] as const;
export type AccountActionType = (typeof ACCOUNT_ACTION_TYPES)[number];
export const RECURRING_ACTION_TYPES = ["RECURRING_CREATE", "RECURRING_MANAGE"] as const;
export type RecurringActionType = (typeof RECURRING_ACTION_TYPES)[number];
export type PlanActionType = Exclude<
  AgentActionType,
  "TRANSACTION_CREATE" | TransactionChangeActionType | AccountActionType | RecurringActionType | "INBOX_RESOLVE"
>;

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

export const TRANSACTION_CHANGE_FIELDS = [
  "change",
  "amount",
  "date",
  "account",
  "destinationAccount",
  "category",
] as const;
export type TransactionChangeField = (typeof TRANSACTION_CHANGE_FIELDS)[number];

export interface TransactionChangeSet {
  /** Exact minor units, serialized because JSON has no bigint. */
  readonly amountMinor?: string;
  readonly accountId?: string;
  readonly transferAccountId?: string;
  readonly categoryId?: string;
  readonly merchantName?: string;
  readonly note?: string;
  /** Calendar date in the workspace timezone. */
  readonly occurredOn?: string;
}

export interface TransactionChangeDraft {
  /** FINANCIAL changes money or accounts and must run as a ledger correction, never an in-place edit. */
  readonly changeType: "DETAILS" | "FINANCIAL";
  readonly transactionId: string;
  readonly transactionKind: TransactionDraftKind;
  /** Optimistic-lock token of the targeted ledger row when the draft was prepared. */
  readonly expectedUpdatedAt: string;
  readonly currency: string;
  readonly current: {
    readonly amountMinor: string;
    readonly accountId: string | null;
    readonly transferAccountId: string | null;
    readonly categoryId: string | null;
    readonly occurredAt: string;
  };
  readonly changes: TransactionChangeSet;
  readonly amountText: string | null;
  readonly reason: string | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly TransactionChangeField[];
}

export const ACCOUNT_DRAFT_OPERATIONS = ["CREATE", "RENAME", "CHANGE_TYPE", "ARCHIVE", "RESTORE"] as const;
export type AccountDraftOperation = (typeof ACCOUNT_DRAFT_OPERATIONS)[number];

export const ACCOUNT_DRAFT_FIELDS = ["account", "name", "type", "currency"] as const;
export type AccountDraftField = (typeof ACCOUNT_DRAFT_FIELDS)[number];

export interface AccountDraftAccount {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly status: "ACTIVE" | "ARCHIVED";
}

export interface AccountDraft {
  readonly accountOperation: AccountDraftOperation;
  /** Null for CREATE, and while the member still has to choose between candidates. */
  readonly accountId: string | null;
  /** Optimistic-lock token of the targeted account when the draft was prepared. */
  readonly expectedUpdatedAt: string | null;
  readonly current: AccountDraftAccount | null;
  /** The new account's name for CREATE, the requested name for RENAME. */
  readonly name: string | null;
  /** The new account's type for CREATE, the requested type for CHANGE_TYPE. */
  readonly type: LedgerAccountType | null;
  readonly currency: string | null;
  readonly candidates: readonly AccountDraftAccount[];
  readonly sourceText: string | null;
  readonly missingFields: readonly AccountDraftField[];
}

export const RECURRING_DRAFT_OPERATIONS = [
  "CREATE",
  "EDIT",
  "PAUSE",
  "RESUME",
  "CONFIRM",
  "IGNORE",
  "RESTORE",
] as const;
export type RecurringDraftOperation = (typeof RECURRING_DRAFT_OPERATIONS)[number];

export const RECURRING_DRAFT_FIELDS = [
  "recurring",
  "direction",
  "name",
  "amount",
  "frequency",
  "nextOccurrence",
  "account",
  "category",
  "currency",
  "change",
] as const;
export type RecurringDraftField = (typeof RECURRING_DRAFT_FIELDS)[number];

export interface RecurringDraftTarget {
  readonly id: string;
  readonly name: string;
  readonly direction: RecurringPaymentDirection;
  /** MANUAL patterns were entered by a member; DETECTED ones were inferred from real transactions. */
  readonly provenance: RecurringPaymentOrigin;
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: RecurringPaymentLifecycle;
  readonly amountMinor: string;
  readonly currency: string;
  readonly cadenceDays: number;
}

export interface RecurringDraftValues {
  readonly name?: string;
  /** Exact minor units, serialized because JSON has no bigint. */
  readonly amountMinor?: string;
  readonly cadenceDays?: number;
  /** Calendar date of the next projected occurrence. */
  readonly nextOccurrenceOn?: string;
  readonly accountId?: string;
  readonly categoryId?: string;
}

export interface RecurringApprovalSummary {
  readonly title: string;
  readonly name: string;
  readonly amount: string;
  readonly changes: readonly string[];
  readonly effects: readonly string[];
  readonly text: string;
}

export interface RecurringDraft {
  readonly recurringOperation: RecurringDraftOperation;
  /** Null for CREATE, and while the member still has to choose between candidates. */
  readonly recurringId: string | null;
  /** Optimistic-lock token of the targeted recurring item when the draft was prepared. */
  readonly expectedUpdatedAt: string | null;
  readonly current: RecurringDraftTarget | null;
  /** Set for CREATE only; an existing item never changes direction. */
  readonly direction: RecurringPaymentDirection | null;
  readonly currency: string | null;
  /** The new pattern for CREATE, the requested future values for EDIT, empty otherwise. */
  readonly values: RecurringDraftValues;
  readonly amountText: string | null;
  readonly candidates: readonly RecurringDraftTarget[];
  /** Present once the draft is complete; it is what the member is asked to approve. */
  readonly approvalSummary: RecurringApprovalSummary | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly RecurringDraftField[];
}

export const INBOX_DRAFT_FIELDS = ["item", "category"] as const;
export type InboxDraftField = (typeof INBOX_DRAFT_FIELDS)[number];

export interface InboxDraftCategory {
  readonly id: string;
  readonly name: string;
}

export interface InboxDraftItem {
  readonly id: string;
  readonly reason: InboxReason;
  readonly issue: string;
  readonly transactionId: string;
  readonly merchantName: string | null;
  /** Exact minor units, serialized because JSON has no bigint. */
  readonly amountMinor: string;
  readonly currency: string;
  readonly occurredAt: string;
}

export interface InboxApprovalSummary {
  readonly title: string;
  readonly transaction: string;
  readonly issue: string;
  readonly change: string;
  readonly effects: readonly string[];
  readonly text: string;
}

export interface InboxResolutionDraft {
  readonly inboxOperation: AgentInboxOperation;
  /** Null while the member still has to choose between candidates. */
  readonly inboxItemId: string | null;
  readonly item: InboxDraftItem | null;
  /** Optimistic-lock tokens of the Inbox item and its transaction when the draft was prepared. */
  readonly expectedInboxUpdatedAt: string | null;
  readonly expectedTransactionUpdatedAt: string | null;
  readonly currentCategory: InboxDraftCategory | null;
  /** The category the transaction receives; set for category operations only. */
  readonly category: InboxDraftCategory | null;
  /** Version of the accepted suggestion; set for ACCEPT_SUGGESTION only. */
  readonly expectedSuggestionUpdatedAt: string | null;
  /** The detected recurring payment under review; set for recurring operations only. */
  readonly recurringId: string | null;
  readonly candidates: readonly InboxDraftItem[];
  readonly categoryCandidates: readonly InboxDraftCategory[];
  /** Present once the draft is complete; it is what the member is asked to approve. */
  readonly approvalSummary: InboxApprovalSummary | null;
  readonly sourceText: string | null;
  readonly missingFields: readonly InboxDraftField[];
}

export type PlanDraft = BudgetDraft | SavingsGoalDraft;
export type AgentActionDraft =
  | TransactionDraft
  | TransactionChangeDraft
  | PlanDraft
  | AccountDraft
  | RecurringDraft
  | InboxResolutionDraft;

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

export interface TransactionChangeActionResult {
  readonly changeType: TransactionChangeDraft["changeType"];
  /** The current effective transaction after the change; a correction returns its replacement. */
  readonly transactionId: string;
  readonly originalTransactionId: string;
  readonly verifiedAt: string;
}

export interface AccountActionResult {
  readonly accountOperation: AccountDraftOperation;
  readonly accountId: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly status: AccountDraftAccount["status"];
  readonly verifiedAt: string;
}

export interface RecurringActionResult {
  readonly recurringOperation: RecurringDraftOperation;
  readonly recurringId: string;
  readonly name: string;
  readonly direction: RecurringPaymentDirection;
  readonly provenance: RecurringPaymentOrigin;
  readonly status: RecurringPaymentStatus;
  readonly lifecycle: RecurringPaymentLifecycle;
  readonly amountMinor: string;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly nextOccurrenceAt: string | null;
  readonly verifiedAt: string;
}

export interface InboxActionResult {
  readonly inboxOperation: AgentInboxOperation;
  readonly inboxItemId: string;
  readonly reason: InboxReason;
  readonly itemStatus: InboxItemStatus;
  readonly transactionId: string;
  readonly category: InboxDraftCategory | null;
  readonly recurring: { readonly id: string; readonly status: RecurringPaymentStatus } | null;
  readonly resolvedInboxItemIds: readonly string[];
  /** Other reasons still open for the same transaction; they were not touched. */
  readonly remainingReasons: readonly InboxReason[];
  readonly verifiedAt: string;
}

export type AgentActionResult =
  | TransactionActionResult
  | TransactionChangeActionResult
  | PlanActionResult
  | AccountActionResult
  | RecurringActionResult
  | InboxActionResult;

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

export type TransactionChangeAgentActionRecord = AgentActionRecord & {
  readonly type: TransactionChangeActionType;
  readonly draft: TransactionChangeDraft;
  readonly result: TransactionChangeActionResult | null;
};

export type PlanAgentActionRecord = AgentActionRecord & {
  readonly type: PlanActionType;
  readonly draft: PlanDraft;
  readonly result: PlanActionResult | null;
};

export type AccountAgentActionRecord = AgentActionRecord & {
  readonly type: AccountActionType;
  readonly draft: AccountDraft;
  readonly result: AccountActionResult | null;
};

export type RecurringAgentActionRecord = AgentActionRecord & {
  readonly type: RecurringActionType;
  readonly draft: RecurringDraft;
  readonly result: RecurringActionResult | null;
};

export type InboxAgentActionRecord = AgentActionRecord & {
  readonly type: "INBOX_RESOLVE";
  readonly draft: InboxResolutionDraft;
  readonly result: InboxActionResult | null;
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

export function isTransactionChangeDraftReady(draft: TransactionChangeDraft): boolean {
  return draft.missingFields.length === 0 && Object.keys(draft.changes).length > 0;
}

export function isAccountDraftReady(draft: AccountDraft): boolean {
  if (draft.missingFields.length > 0) return false;
  if (draft.accountOperation === "CREATE") return Boolean(draft.name && draft.type && draft.currency);
  if (!draft.accountId || !draft.expectedUpdatedAt) return false;
  if (draft.accountOperation === "RENAME") return Boolean(draft.name);
  return draft.accountOperation === "CHANGE_TYPE" ? Boolean(draft.type) : true;
}

export function isRecurringDraftReady(draft: RecurringDraft): boolean {
  if (draft.missingFields.length > 0 || !draft.approvalSummary) return false;
  if (draft.recurringOperation === "CREATE") {
    const { name, amountMinor, cadenceDays, nextOccurrenceOn } = draft.values;
    return Boolean(draft.direction && draft.currency && name && amountMinor && cadenceDays && nextOccurrenceOn);
  }
  if (!draft.recurringId || !draft.expectedUpdatedAt) return false;
  return draft.recurringOperation === "EDIT" ? Object.keys(draft.values).length > 0 : true;
}

export function isInboxDraftReady(draft: InboxResolutionDraft): boolean {
  if (draft.missingFields.length > 0 || !draft.approvalSummary) return false;
  if (!draft.inboxItemId || !draft.item || !draft.expectedInboxUpdatedAt) return false;
  switch (draft.inboxOperation) {
    case "ACCEPT_SUGGESTION":
      return Boolean(draft.category && draft.expectedTransactionUpdatedAt && draft.expectedSuggestionUpdatedAt);
    case "CHOOSE_CATEGORY":
      return Boolean(draft.category && draft.expectedTransactionUpdatedAt);
    case "CONFIRM_RECURRING":
    case "IGNORE_RECURRING":
      return Boolean(draft.recurringId);
  }
}

export function isAgentActionDraftReady(draft: AgentActionDraft): boolean {
  if ("inboxOperation" in draft) return isInboxDraftReady(draft);
  if ("recurringOperation" in draft) return isRecurringDraftReady(draft);
  if ("accountOperation" in draft) return isAccountDraftReady(draft);
  if ("changeType" in draft) return isTransactionChangeDraftReady(draft);
  return "kind" in draft ? isTransactionDraftReady(draft) : isPlanDraftReady(draft);
}

export function isTransactionAction(action: AgentActionRecord): action is TransactionAgentActionRecord {
  return action.type === "TRANSACTION_CREATE" && "kind" in action.draft;
}

export function isTransactionChangeAction(action: AgentActionRecord): action is TransactionChangeAgentActionRecord {
  return (
    (TRANSACTION_CHANGE_ACTION_TYPES as readonly string[]).includes(action.type) && "changeType" in action.draft
  );
}

export function isAccountAction(action: AgentActionRecord): action is AccountAgentActionRecord {
  return (ACCOUNT_ACTION_TYPES as readonly string[]).includes(action.type) && "accountOperation" in action.draft;
}

export function isRecurringAction(action: AgentActionRecord): action is RecurringAgentActionRecord {
  return (
    (RECURRING_ACTION_TYPES as readonly string[]).includes(action.type) && "recurringOperation" in action.draft
  );
}

export function isInboxAction(action: AgentActionRecord): action is InboxAgentActionRecord {
  return action.type === "INBOX_RESOLVE" && "inboxOperation" in action.draft;
}

export function isPlanAction(action: AgentActionRecord): action is PlanAgentActionRecord {
  return "planType" in action.draft && !isTransactionChangeAction(action) && action.type !== "TRANSACTION_CREATE";
}
