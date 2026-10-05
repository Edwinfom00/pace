import { ConflictError, NotFoundError } from "@/authorization/errors";
import {
  inboxOperationFitsReason,
  inboxReasonHasResolution,
  isCategoryInboxOperation,
  type AgentInboxOperation,
  type AgentInboxReference,
} from "@/modules/financial-inbox/agent-inbox-query";
import type { InboxReason } from "@/modules/financial-inbox/domain";
import {
  agentInboxIssue,
  agentInboxUnavailableReason,
  allowedAgentInboxOperations,
  currentSuggestion,
  resolveAgentInboxReference,
  type AgentInboxItemState,
  type AgentInboxReferenceResolution,
} from "@/modules/financial-inbox/queries/agent-inbox-reads";
import type { LedgerCategoryRecord } from "@/modules/ledger/domain";

import {
  INBOX_DRAFT_FIELDS,
  type InboxActionResult,
  type InboxApprovalSummary,
  type InboxDraftCategory,
  type InboxDraftField,
  type InboxDraftItem,
  type InboxResolutionDraft,
} from "./domain";
import { cadenceLabel, formatAmount } from "./recurring-draft";
import { cleanOptionalText, matchByName } from "./transaction-draft";

export interface InboxDraftIntent extends AgentInboxReference {
  inboxOperation: AgentInboxOperation;
  categoryName?: string | null;
  sourceText?: string | null;
}

export interface InboxDraftContext {
  states: readonly AgentInboxItemState[];
  categories: readonly LedgerCategoryRecord[];
}

const CANDIDATE_LIMIT = 10;
const CATEGORY_CANDIDATE_LIMIT = 50;

const CATEGORY_EFFECTS = [
  "Only this transaction's category changes.",
  "Its amount, account, and date stay the same, and no balance is affected.",
] as const;

const RECURRING_EFFECTS: Readonly<Record<"CONFIRM_RECURRING" | "IGNORE_RECURRING", readonly [string, string]>> = {
  CONFIRM_RECURRING: [
    "This will confirm the detected pattern so Pace projects its future occurrences.",
    "It will not create or modify any Transaction.",
  ],
  IGNORE_RECURRING: [
    "This will stop Pace from treating this detected pattern as recurring. It can be restored later.",
    "It will not modify past Transactions.",
  ],
};

/**
 * Finds the open Inbox item a resolution targets. A name is matched among the
 * items the operation applies to first; a name that only matches another kind
 * of item still resolves, so the caller can explain why it cannot be resolved.
 */
export function locateInboxDraftTarget(
  intent: InboxDraftIntent,
  states: readonly AgentInboxItemState[],
): AgentInboxReferenceResolution {
  if (intent.inboxItemId) {
    const byId = resolveAgentInboxReference(intent, states);
    if (byId.status !== "RESOLVED") throw new NotFoundError("This Inbox item is not open in this workspace.");
    return byId;
  }

  const eligible = states.filter((state) => inboxOperationFitsReason(intent.inboxOperation, state.item.reason));
  const amongEligible = resolveAgentInboxReference(intent, eligible);
  if (amongEligible.status !== "NOT_FOUND" || !cleanOptionalText(intent.merchantName)) return amongEligible;

  const amongAll = resolveAgentInboxReference(intent, states);
  return amongAll.status === "RESOLVED" ? amongAll : amongEligible;
}

/**
 * Turns a requested Inbox resolution into a JSON-safe draft. The item, the
 * category, and the recurring payment are resolved here from the workspace's
 * own records, never from an id or a guess by the model, and the canonical
 * Inbox resolution policy decides whether the operation is allowed.
 */
export function buildInboxDraft(intent: InboxDraftIntent, context: InboxDraftContext): InboxResolutionDraft {
  const operation = intent.inboxOperation;
  const target = locateInboxDraftTarget(intent, context.states);
  const state = target.status === "RESOLVED" ? target.state : null;
  const missingFields: InboxDraftField[] = state ? [] : ["item"];
  let category: InboxDraftCategory | null = null;
  let categoryCandidates: InboxDraftCategory[] = [];

  if (state) {
    assertInboxOperationAllowed(operation, state);
    if (operation === "ACCEPT_SUGGESTION") {
      const suggestion = currentSuggestion(state);
      if (!suggestion) throw new ConflictError("There is no current category suggestion to accept.");
      category = presentCategory(suggestion);
    } else if (operation === "CHOOSE_CATEGORY") {
      const eligible = context.categories.filter((candidate) => candidate.kind === state.transaction.kind);
      const chosen = matchByName(intent.categoryName, eligible);
      if (chosen) category = presentCategory(chosen);
      else {
        missingFields.push("category");
        categoryCandidates = eligible.slice(0, CATEGORY_CANDIDATE_LIMIT).map(presentCategory);
      }
    }
  }

  const missing = INBOX_DRAFT_FIELDS.filter((field) => missingFields.includes(field));
  const isCategoryOperation = isCategoryInboxOperation(operation);
  return {
    inboxOperation: operation,
    inboxItemId: state?.item.id ?? null,
    item: state ? presentDraftItem(state) : null,
    expectedInboxUpdatedAt: state?.item.updatedAt.toISOString() ?? null,
    expectedTransactionUpdatedAt: state && isCategoryOperation ? state.transaction.updatedAt.toISOString() : null,
    currentCategory: state?.currentCategory ? presentCategory(state.currentCategory) : null,
    category,
    expectedSuggestionUpdatedAt:
      state && operation === "ACCEPT_SUGGESTION" ? (state.classification?.updatedAt.toISOString() ?? null) : null,
    recurringId: state && !isCategoryOperation ? (state.recurring?.id ?? null) : null,
    candidates: target.status === "RESOLVED" ? [] : target.candidates.slice(0, CANDIDATE_LIMIT).map(presentDraftItem),
    categoryCandidates,
    approvalSummary: state && missing.length === 0 ? approvalSummary(operation, state, category) : null,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields: missing,
  };
}

/**
 * Re-checks an approved draft against the Inbox item as it is now. Anything
 * that moved since the member saw the approval summary refuses the execution.
 */
export function assertInboxDraftCurrent(
  draft: InboxResolutionDraft,
  state: AgentInboxItemState | null,
  categories: readonly LedgerCategoryRecord[],
): void {
  if (!state || state.item.status !== "OPEN") throw new ConflictError("This Inbox item is no longer open.");
  const changed = new ConflictError(
    "This Inbox item changed since the resolution was prepared. Review it again before resolving it.",
  );
  if (state.item.updatedAt.toISOString() !== draft.expectedInboxUpdatedAt) throw changed;
  if (!allowedAgentInboxOperations(state).includes(draft.inboxOperation)) {
    throw new ConflictError(agentInboxUnavailableReason(state) ?? "This Inbox resolution is no longer allowed.");
  }

  if (!isCategoryInboxOperation(draft.inboxOperation)) {
    if (state.recurring?.id !== draft.recurringId) throw changed;
    return;
  }
  if (state.transaction.updatedAt.toISOString() !== draft.expectedTransactionUpdatedAt) {
    throw new ConflictError("The transaction changed since the resolution was prepared. Review it again.");
  }
  const category = categories.find((candidate) => candidate.id === draft.category?.id);
  if (!category || category.kind !== state.transaction.kind) {
    throw new ConflictError("The chosen category is no longer available for this transaction.");
  }
  if (draft.inboxOperation === "ACCEPT_SUGGESTION") {
    const suggestion = currentSuggestion(state);
    if (
      !suggestion ||
      suggestion.id !== draft.category?.id ||
      state.classification?.updatedAt.toISOString() !== draft.expectedSuggestionUpdatedAt
    ) {
      throw new ConflictError("The category suggestion changed since the resolution was prepared. Review it again.");
    }
  }
}

/** True when the stored Inbox item and its source are exactly what the approved draft asked for. */
export function persistedInboxResolutionMatches(
  draft: InboxResolutionDraft,
  state: AgentInboxItemState | null,
): state is AgentInboxItemState {
  if (!state || state.item.id !== draft.inboxItemId || state.item.status !== "RESOLVED") return false;
  if (isCategoryInboxOperation(draft.inboxOperation)) {
    return draft.category !== null && state.transaction.categoryId === draft.category.id;
  }
  return (
    state.recurring !== null &&
    state.recurring.id === draft.recurringId &&
    state.recurring.status === (draft.inboxOperation === "CONFIRM_RECURRING" ? "CONFIRMED" : "IGNORED")
  );
}

export function presentInboxResult(
  draft: InboxResolutionDraft,
  state: AgentInboxItemState,
  outcome: { readonly resolvedInboxItemIds: readonly string[]; readonly unresolvedReasons: readonly InboxReason[] },
  verifiedAt: Date,
): InboxActionResult {
  const isCategoryOperation = isCategoryInboxOperation(draft.inboxOperation);
  return {
    inboxOperation: draft.inboxOperation,
    inboxItemId: state.item.id,
    reason: state.item.reason,
    itemStatus: state.item.status,
    transactionId: state.transaction.id,
    category: isCategoryOperation ? draft.category : null,
    recurring:
      !isCategoryOperation && state.recurring ? { id: state.recurring.id, status: state.recurring.status } : null,
    resolvedInboxItemIds: outcome.resolvedInboxItemIds,
    remainingReasons: outcome.unresolvedReasons,
    verifiedAt: verifiedAt.toISOString(),
  };
}

export function inboxIdempotencyKey(actionId: string): string {
  return `agent-action:${actionId}`;
}

function assertInboxOperationAllowed(operation: AgentInboxOperation, state: AgentInboxItemState): void {
  const { reason } = state.item;
  if (!inboxReasonHasResolution(reason)) {
    throw new ConflictError(agentInboxUnavailableReason(state) ?? "This Inbox item cannot be resolved.");
  }
  if (!inboxOperationFitsReason(operation, reason)) {
    throw new ConflictError(
      isCategoryInboxOperation(operation)
        ? `This Inbox item is about "${agentInboxIssue(reason)}", not a category. It can only be confirmed or ignored as a recurring payment.`
        : `This Inbox item is about "${agentInboxIssue(reason)}", not a recurring payment. It can only be resolved by confirming a category.`,
    );
  }
  const allowed = allowedAgentInboxOperations(state);
  if (allowed.includes(operation)) return;
  if (operation === "ACCEPT_SUGGESTION" && allowed.includes("CHOOSE_CATEGORY")) {
    throw new ConflictError("There is no current category suggestion to accept. Choose a category instead.");
  }
  throw new ConflictError(
    agentInboxUnavailableReason(state) ?? "This Inbox resolution is not allowed in the item's current state.",
  );
}

function approvalSummary(
  operation: AgentInboxOperation,
  state: AgentInboxItemState,
  category: InboxDraftCategory | null,
): InboxApprovalSummary {
  const title = "Resolve Inbox item";
  const { transaction } = state;
  const transactionLine = `${state.merchantName ?? "Unknown merchant"} — ${formatAmount(transaction.amountMinor.toString(), transaction.currency)}`;
  const issue = agentInboxIssue(state.item.reason);
  const { change, effects } = describeChange(operation, state, category);
  return {
    title,
    transaction: transactionLine,
    issue,
    change,
    effects,
    text: [title, "", "Transaction:", transactionLine, "", "Current issue:", issue, "", "Change:", change, "", ...effects].join("\n"),
  };
}

function describeChange(
  operation: AgentInboxOperation,
  state: AgentInboxItemState,
  category: InboxDraftCategory | null,
): { readonly change: string; readonly effects: readonly string[] } {
  if (operation === "CONFIRM_RECURRING" || operation === "IGNORE_RECURRING") {
    const recurring = state.recurring;
    const pattern = recurring
      ? `${formatAmount(recurring.typicalAmountMinor.toString(), recurring.currency)} / ${cadenceLabel(recurring.cadenceDays)}`
      : "detected pattern";
    return {
      change: `${operation === "CONFIRM_RECURRING" ? "Confirm" : "Ignore"} detected recurring payment — ${pattern}`,
      effects: RECURRING_EFFECTS[operation],
    };
  }
  return {
    change: `${state.currentCategory?.name ?? "Uncategorized"} → ${category?.name ?? "Uncategorized"}`,
    effects: CATEGORY_EFFECTS,
  };
}

function presentCategory(category: Pick<LedgerCategoryRecord, "id" | "name">): InboxDraftCategory {
  return { id: category.id, name: category.name };
}

function presentDraftItem(state: AgentInboxItemState): InboxDraftItem {
  return {
    id: state.item.id,
    reason: state.item.reason,
    issue: agentInboxIssue(state.item.reason),
    transactionId: state.transaction.id,
    merchantName: state.merchantName,
    amountMinor: state.transaction.amountMinor.toString(),
    currency: state.transaction.currency,
    occurredAt: state.transaction.occurredAt.toISOString(),
  };
}
