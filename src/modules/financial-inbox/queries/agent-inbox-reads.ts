import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  assertWorkspacePermission,
  canPerformWorkspaceAction,
  type WorkspaceRole,
} from "@/authorization/workspace-permissions";
import type { LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { frequencyForCadenceDays } from "@/modules/recurring/domain/recurring-frequency";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  AGENT_INBOX_OPERATIONS,
  inboxReasonHasResolution,
  type AgentInboxListQuery,
  type AgentInboxOperation,
  type AgentInboxReference,
} from "../agent-inbox-query";
import { HIGH_CONFIDENCE_THRESHOLD } from "../classification";
import {
  INBOX_REASONS,
  type FinancialInboxItemRecord,
  type InboxReason,
  type RecurringPaymentRecord,
  type TransactionClassificationRecord,
} from "../domain";
import { getInboxResolutionCapabilities, type InboxResolutionCapabilities } from "../inbox-resolution-policy";
import type { FinancialInboxRepository } from "../repositories/financial-inbox-repository";

export type AgentInboxReadDependencies = {
  readonly inbox: Pick<
    FinancialInboxRepository,
    "findInboxItem" | "listInboxItems" | "listInboxItemsForTransaction" | "findClassification" | "findRecurringPaymentById"
  >;
  readonly ledger: Pick<
    LedgerRepository,
    | "findTransaction"
    | "findCategory"
    | "findMerchant"
    | "findAccount"
    | "findTransactionCorrectionByOriginal"
    | "findTransactionReversalByOriginal"
  >;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};

type ReadScope = { readonly actor: AuthenticatedActor; readonly workspaceId: string };

export type AgentInboxItemState = {
  readonly item: FinancialInboxItemRecord;
  readonly transaction: LedgerTransactionRecord;
  /** True once the source transaction was corrected or reversed; the item then describes a version that is no longer effective. */
  readonly superseded: boolean;
  readonly merchantName: string | null;
  readonly accountName: string | null;
  readonly currentCategory: LedgerCategoryRecord | null;
  readonly classification: TransactionClassificationRecord | null;
  readonly suggestedCategory: LedgerCategoryRecord | null;
  readonly recurring: RecurringPaymentRecord | null;
  readonly relatedItems: readonly FinancialInboxItemRecord[];
  readonly capabilities: InboxResolutionCapabilities;
  readonly workspaceRole: WorkspaceRole;
};

export interface AgentInboxStateReader {
  listOpenItems(actor: AuthenticatedActor, workspaceId: string): Promise<readonly AgentInboxItemState[]>;
  getItem(actor: AuthenticatedActor, workspaceId: string, inboxItemId: string): Promise<AgentInboxItemState | null>;
}

export type AgentInboxReferenceResolution =
  | { readonly status: "RESOLVED"; readonly state: AgentInboxItemState }
  | { readonly status: "AMBIGUOUS" | "NOT_FOUND"; readonly candidates: readonly AgentInboxItemState[] };

const CANDIDATE_LIMIT = 10;

const ISSUES: Readonly<Record<InboxReason, string>> = {
  UNKNOWN_CATEGORY: "Category is missing",
  CLASSIFICATION_REVIEW: "Category needs review",
  POSSIBLE_RECURRING: "Possible recurring payment",
  MERCHANT_AMBIGUITY: "Merchant is ambiguous",
  POSSIBLE_TRANSFER: "Possible transfer",
};

const RESOLUTION_NOTES: Readonly<Record<InboxReason, string>> = {
  UNKNOWN_CATEGORY:
    "Resolved by confirming a category on the transaction: accept Pace's suggestion when there is one, or choose a category.",
  CLASSIFICATION_REVIEW:
    "Resolved by confirming a category on the transaction: accept Pace's suggestion when there is one, or choose another category.",
  POSSIBLE_RECURRING:
    "Resolved by confirming or ignoring the detected recurring payment. Neither creates or changes a Transaction.",
  MERCHANT_AMBIGUITY:
    "Pace has no safe way to settle a merchant ambiguity yet. It cannot be resolved, dismissed, or marked as reviewed here, and it stays in the Inbox.",
  POSSIBLE_TRANSFER:
    "Pace cannot convert this transaction into a transfer or settle this item yet. Nothing is changed and it stays in the Inbox.",
};

export function createAgentInboxStateReader(dependencies: AgentInboxReadDependencies): AgentInboxStateReader {
  return {
    async listOpenItems(actor, workspaceId) {
      const role = await requireReader({ actor, workspaceId }, dependencies);
      return readOpenStates(workspaceId, role, dependencies);
    },
    async getItem(actor, workspaceId, inboxItemId) {
      const role = await requireReader({ actor, workspaceId }, dependencies);
      const item = await dependencies.inbox.findInboxItem(workspaceId, inboxItemId);
      return item ? readState(workspaceId, item, role, dependencies) : null;
    },
  };
}

export async function listAgentInbox(
  input: ReadScope & { readonly query: AgentInboxListQuery },
  dependencies: AgentInboxReadDependencies,
) {
  const role = await requireReader(input, dependencies);
  const states = await readOpenStates(input.workspaceId, role, dependencies);
  const matching =
    input.query.reason === "ALL" ? states : states.filter((state) => state.item.reason === input.query.reason);
  const listed = matching.slice(0, input.query.limit);

  return {
    unresolvedCount: states.length,
    summary: INBOX_REASONS.flatMap((reason) => {
      const count = states.filter((state) => state.item.reason === reason).length;
      return count > 0
        ? [{ reason, issue: ISSUES[reason], count, resolutionSupported: inboxReasonHasResolution(reason) }]
        : [];
    }),
    filter: input.query.reason,
    matchingCount: matching.length,
    listedCount: listed.length,
    items: listed.map(presentAgentInboxItem),
  };
}

export async function getAgentInboxItem(
  input: ReadScope & { readonly reference: AgentInboxReference },
  dependencies: AgentInboxReadDependencies,
) {
  const role = await requireReader(input, dependencies);
  const located = resolveAgentInboxReference(
    input.reference,
    await readOpenStates(input.workspaceId, role, dependencies),
  );
  if (located.status === "RESOLVED") return { resolved: true as const, item: presentAgentInboxItem(located.state) };
  if (input.reference.inboxItemId) throw new NotFoundError("This Inbox item is not open in this workspace.");
  return {
    resolved: false as const,
    reason: located.status,
    candidates: located.candidates.slice(0, CANDIDATE_LIMIT).map(presentAgentInboxCandidate),
  };
}

/**
 * Finds the open item a member referred to. An id must be one a tool returned;
 * a merchant name must match exactly one open item. Nothing is ever picked on
 * the member's behalf when the reference is missing or matches several items.
 */
export function resolveAgentInboxReference(
  reference: AgentInboxReference,
  states: readonly AgentInboxItemState[],
): AgentInboxReferenceResolution {
  if (reference.inboxItemId) {
    const state = states.find((candidate) => candidate.item.id === reference.inboxItemId);
    return state ? { status: "RESOLVED", state } : { status: "NOT_FOUND", candidates: [] };
  }

  const name = normalizeName(reference.merchantName);
  if (!name) return { status: states.length > 0 ? "AMBIGUOUS" : "NOT_FOUND", candidates: states };

  const exact = states.filter((state) => normalizeName(state.merchantName) === name);
  const matches = exact.length > 0 ? exact : states.filter((state) => normalizeName(state.merchantName).includes(name));
  if (matches.length === 1) return { status: "RESOLVED", state: matches[0]! };
  return matches.length > 1 ? { status: "AMBIGUOUS", candidates: matches } : { status: "NOT_FOUND", candidates: states };
}

/** The canonical resolution policy decides every operation; an unsupported reason never yields one. */
export function allowedAgentInboxOperations(state: AgentInboxItemState): readonly AgentInboxOperation[] {
  if (state.item.status !== "OPEN" || state.superseded) return [];
  const { capabilities } = state;
  return AGENT_INBOX_OPERATIONS.filter((operation) => {
    switch (operation) {
      case "ACCEPT_SUGGESTION":
        return capabilities.canAcceptCategorySuggestion;
      case "CHOOSE_CATEGORY":
        return capabilities.canChooseCategory;
      case "CONFIRM_RECURRING":
        return capabilities.recurring?.canConfirm === true;
      case "IGNORE_RECURRING":
        return capabilities.recurring?.canIgnore === true;
    }
  });
}

export function agentInboxUnavailableReason(state: AgentInboxItemState): string | null {
  if (!inboxReasonHasResolution(state.item.reason)) return RESOLUTION_NOTES[state.item.reason];
  if (allowedAgentInboxOperations(state).length > 0) return null;
  if (state.item.status !== "OPEN") return "This Inbox item is no longer open.";
  if (state.superseded) {
    return "The transaction behind this Inbox item was corrected or reversed, so the item is no longer current.";
  }
  if (!canPerformWorkspaceAction(state.workspaceRole, "manage_ledger")) {
    return "You do not have permission to resolve Inbox items in this workspace.";
  }
  if (state.capabilities.reasons.CHOOSE_CATEGORY === "CATEGORY_ALREADY_CONFIRMED") {
    return "This transaction already has a confirmed category.";
  }
  return "This Inbox item cannot be resolved in its current state.";
}

export function agentInboxIssue(reason: InboxReason): string {
  return ISSUES[reason];
}

export function presentAgentInboxCandidate(state: AgentInboxItemState) {
  return {
    id: state.item.id,
    reason: state.item.reason,
    issue: ISSUES[state.item.reason],
    merchantName: state.merchantName,
    amount: money(state.transaction.amountMinor, state.transaction.currency),
    occurredAt: state.transaction.occurredAt.toISOString(),
  };
}

export function presentAgentInboxItem(state: AgentInboxItemState) {
  const { item, transaction, classification, recurring } = state;
  const suggestion = currentSuggestion(state);
  const operations = allowedAgentInboxOperations(state);

  return {
    ...presentAgentInboxCandidate(state),
    status: item.status,
    why: explain(state),
    createdAt: item.createdAt.toISOString(),
    transaction: {
      id: transaction.id,
      kind: transaction.kind,
      amount: money(transaction.amountMinor, transaction.currency),
      occurredAt: transaction.occurredAt.toISOString(),
      merchantName: state.merchantName,
      note: transaction.note,
      accountName: state.accountName,
      category: state.currentCategory ? { id: state.currentCategory.id, name: state.currentCategory.name } : null,
      isCurrent: !state.superseded,
    },
    suggestion:
      suggestion && classification
        ? {
            category: { id: suggestion.id, name: suggestion.name },
            confidence: classification.confidence >= HIGH_CONFIDENCE_THRESHOLD ? ("HIGH" as const) : ("REVIEW" as const),
          }
        : null,
    recurring:
      item.reason === "POSSIBLE_RECURRING" && recurring
        ? {
            id: recurring.id,
            name: recurring.displayName ?? recurring.normalizedMerchant ?? state.merchantName,
            status: recurring.status,
            typicalAmount: money(recurring.typicalAmountMinor, recurring.currency),
            cadenceDays: recurring.cadenceDays,
            frequency: frequencyForCadenceDays(recurring.cadenceDays),
          }
        : null,
    otherOpenReasons: otherOpenReasons(state),
    resolution: {
      supported: inboxReasonHasResolution(item.reason),
      availableOperations: operations,
      note: RESOLUTION_NOTES[item.reason],
      unavailableReason: agentInboxUnavailableReason(state),
    },
  };
}

export function currentSuggestion(state: AgentInboxItemState): LedgerCategoryRecord | null {
  return state.classification?.status === "NEEDS_REVIEW" ? state.suggestedCategory : null;
}

export function otherOpenReasons(state: AgentInboxItemState): readonly InboxReason[] {
  return [
    ...new Set(
      state.relatedItems
        .filter((related) => related.id !== state.item.id && related.status === "OPEN")
        .map((related) => related.reason),
    ),
  ];
}

function explain(state: AgentInboxItemState): string {
  const suggestion = currentSuggestion(state);
  switch (state.item.reason) {
    case "UNKNOWN_CATEGORY":
      return "Pace could not determine a category for this transaction, so it stays uncategorized until a member chooses one.";
    case "CLASSIFICATION_REVIEW":
      return suggestion
        ? `Pace suggested the category "${suggestion.name}" but was not confident enough to apply it on its own, so a member has to confirm or change it.`
        : "The category of this transaction was flagged for review, so a member has to confirm or change it.";
    case "POSSIBLE_RECURRING":
      return state.recurring
        ? `Pace detected that this transaction looks like part of a repeating pattern, about every ${state.recurring.cadenceDays} days. It is only a suggestion until a member confirms or ignores it.`
        : "Pace detected that this transaction looks like part of a repeating pattern. It is only a suggestion until a member confirms or ignores it.";
    case "MERCHANT_AMBIGUITY":
      return "Pace could not tell which merchant this transaction belongs to, so it could not classify it with confidence.";
    case "POSSIBLE_TRANSFER":
      return "The description of this expense looks like money moved between the member's own accounts or wallets, so Pace suspects it is a transfer rather than spending. It is still recorded as an expense.";
  }
}

async function requireReader(input: ReadScope, dependencies: AgentInboxReadDependencies): Promise<WorkspaceRole> {
  const context = await dependencies.workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!context) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(context.membership.role, "read");
  return context.membership.role;
}

async function readOpenStates(
  workspaceId: string,
  role: WorkspaceRole,
  dependencies: AgentInboxReadDependencies,
): Promise<AgentInboxItemState[]> {
  const items = await dependencies.inbox.listInboxItems(workspaceId, "OPEN");
  const states = await Promise.all(items.map((item) => readState(workspaceId, item, role, dependencies)));
  return states.filter((state): state is AgentInboxItemState => state !== null);
}

async function readState(
  workspaceId: string,
  item: FinancialInboxItemRecord,
  workspaceRole: WorkspaceRole,
  { inbox, ledger }: AgentInboxReadDependencies,
): Promise<AgentInboxItemState | null> {
  const transaction = await ledger.findTransaction(workspaceId, item.transactionId);
  if (!transaction) return null;

  const [correction, reversal, classification, recurring, relatedItems, merchant, account, currentCategory] =
    await Promise.all([
      ledger.findTransactionCorrectionByOriginal(workspaceId, transaction.id),
      ledger.findTransactionReversalByOriginal(workspaceId, transaction.id),
      item.classificationId ? inbox.findClassification(workspaceId, item.classificationId) : null,
      item.recurringPaymentId ? inbox.findRecurringPaymentById(workspaceId, item.recurringPaymentId) : null,
      inbox.listInboxItemsForTransaction(workspaceId, transaction.id),
      transaction.merchantId ? ledger.findMerchant(workspaceId, transaction.merchantId) : null,
      transaction.accountId ? ledger.findAccount(workspaceId, transaction.accountId) : null,
      transaction.categoryId ? ledger.findCategory(workspaceId, transaction.categoryId) : null,
    ]);
  const suggestedCategory = classification?.suggestedCategoryId
    ? await ledger.findCategory(workspaceId, classification.suggestedCategoryId)
    : null;

  return {
    item,
    transaction,
    superseded: transaction.reversalOfTransactionId !== null || Boolean(correction) || Boolean(reversal),
    merchantName: merchant?.name ?? classification?.merchantName ?? null,
    accountName: account?.name ?? null,
    currentCategory,
    classification,
    suggestedCategory,
    recurring,
    relatedItems,
    capabilities: getInboxResolutionCapabilities({
      item,
      relatedItems,
      sourceTransaction: transaction,
      effectiveTransaction: transaction,
      classification,
      suggestedCategory,
      recurring,
      workspaceRole,
    }),
    workspaceRole,
  };
}

function money(minorUnits: bigint, currency: string) {
  return { minorUnits: minorUnits.toString(), currency };
}

function normalizeName(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US") ?? "";
}
