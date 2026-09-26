import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/modules/financial-inbox/classification";
import { getInboxResolutionCapabilities } from "@/modules/financial-inbox/inbox-resolution-policy";
import { mapTransactionListItem } from "@/modules/transactions/queries/get-transactions-page";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type {
  InboxDetailActivityEvent,
  InboxItemDetail,
  InboxItemDetailReadRecord,
  InboxItemDetailReader,
} from "../inbox-item-detail";

type InboxDetailWorkspaceRepository = Pick<WorkspaceRepository, "findMembership">;

export type GetInboxItemDetailInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly inboxItemId: string;
  readonly unknownMerchantName: string;
};

export async function getInboxItemDetail(
  input: GetInboxItemDetailInput,
  dependencies: {
    readonly reader: InboxItemDetailReader;
    readonly workspaces: InboxDetailWorkspaceRepository;
  },
): Promise<InboxItemDetail | null> {
  const membership = await dependencies.workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const record = await dependencies.reader.readInboxItemDetail({
    workspaceId: input.workspaceId,
    inboxItemId: input.inboxItemId,
    similarLimit: 3,
  });
  return record ? buildInboxItemDetail(record, input.unknownMerchantName, membership.role) : null;
}

export function buildInboxItemDetail(
  record: InboxItemDetailReadRecord,
  unknownMerchantName: string,
  workspaceRole: WorkspaceMembershipRecord["role"],
): InboxItemDetail {
  const transaction = mapTransactionListItem(record.effectiveTransaction, unknownMerchantName);
  const classification = record.classification;
  const suggestedCategory = classification?.status === "NEEDS_REVIEW" ? record.suggestedCategory : null;
  const effectiveCategory = record.effectiveTransaction.category;
  const capabilities = getInboxResolutionCapabilities({
    item: record.item,
    relatedItems: record.relatedItems,
    sourceTransaction: record.sourceTransaction.transaction,
    effectiveTransaction: record.effectiveTransaction.transaction,
    classification: record.classification,
    suggestedCategory: record.suggestedCategory,
    recurring: record.recurring,
    workspaceRole,
  });
  const status = record.item.status === "DISMISSED"
    ? "DISMISSED"
    : capabilities.isResolved
      ? "RESOLVED"
      : "OPEN";

  return {
    id: record.item.id,
    workspaceId: record.item.workspaceId,
    status,
    reason: record.item.reason,
    updatedAt: record.item.updatedAt.toISOString(),
    sourceId: record.item.transactionId,
    transactionUpdatedAt: record.effectiveTransaction.transaction.updatedAt.toISOString(),
    transaction: {
      ...transaction,
      merchantName: record.effectiveTransaction.merchant?.name ?? null,
      note: record.effectiveTransaction.transaction.note,
      source: transactionSource(record.effectiveTransaction.transaction.source),
      technicalId: record.effectiveTransaction.transaction.id,
      effectiveTransactionId: record.effectiveTransaction.transaction.id,
    },
    currentClassification: effectiveCategory
      ? {
          state: "CONFIRMED",
          category: {
            id: effectiveCategory.id,
            name: effectiveCategory.name,
            systemKey: effectiveCategory.systemKey,
          },
        }
      : classification?.status === "NEEDS_REVIEW"
        ? { state: "UNCERTAIN", category: null }
        : { state: "UNCATEGORIZED", category: null },
    suggestion: suggestedCategory && classification
      ? {
          category: {
            id: suggestedCategory.id,
            name: suggestedCategory.name,
            systemKey: suggestedCategory.systemKey,
          },
          confidence: classification.confidence >= HIGH_CONFIDENCE_THRESHOLD ? "HIGH" : "REVIEW",
          score: classification.confidence,
          updatedAt: classification.updatedAt.toISOString(),
        }
      : null,
    attentionReasons: capabilities.unresolvedReasons,
    similarTransactions: record.similarTransactions.map((item) => mapTransactionListItem(item, unknownMerchantName)),
    context: {
      account: record.effectiveTransaction.account
        ? { id: record.effectiveTransaction.account.id, name: record.effectiveTransaction.account.name }
        : null,
      source: transactionSource(record.effectiveTransaction.transaction.source),
      recurring: record.recurring
        ? {
            id: record.recurring.id,
            displayName: record.recurring.displayName,
            cadenceDays: record.recurring.cadenceDays,
          }
        : null,
    },
    activity: record.audits.flatMap((audit) => {
      const event = detailActivityEvent(audit.event);
      return event ? [{ id: audit.id, event, occurredAt: audit.createdAt.toISOString() }] : [];
    }),
    capabilities,
  };
}

function transactionSource(source: Record<string, unknown>): InboxItemDetail["context"]["source"] {
  switch (source.provider) {
    case "import": return "IMPORT";
    case "manual": return "MANUAL";
    case "agent": return "AGENT";
    case "bank_sync": return "BANK_SYNC";
    default: return null;
  }
}

function detailActivityEvent(value: string): InboxDetailActivityEvent | null {
  switch (value) {
    case "INBOX_ITEM_CREATED":
    case "CLASSIFICATION_REVIEW_CREATED":
    case "RECURRING_CANDIDATE_DETECTED":
      return value;
    default:
      return null;
  }
}
