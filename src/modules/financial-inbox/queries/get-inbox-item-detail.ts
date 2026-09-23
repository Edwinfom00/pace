import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { HIGH_CONFIDENCE_THRESHOLD } from "@/modules/financial-inbox/classification";
import { mapTransactionListItem } from "@/modules/transactions/queries/get-transactions-page";
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
  return record ? buildInboxItemDetail(record, input.unknownMerchantName) : null;
}

export function buildInboxItemDetail(
  record: InboxItemDetailReadRecord,
  unknownMerchantName: string,
): InboxItemDetail {
  const transaction = mapTransactionListItem(record.effectiveTransaction, unknownMerchantName);
  const classification = record.classification;
  const suggestedCategory = classification?.status === "NEEDS_REVIEW" ? record.suggestedCategory : null;
  const attentionReasons = [...new Set(
    record.relatedItems
      .filter((item) => item.status === "OPEN")
      .map((item) => item.reason),
  )];
  const effectiveCategory = record.effectiveTransaction.category;

  return {
    id: record.item.id,
    workspaceId: record.item.workspaceId,
    status: record.item.status,
    reason: record.item.reason,
    sourceId: record.item.transactionId,
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
        }
      : null,
    attentionReasons: attentionReasons.length ? attentionReasons : [record.item.reason],
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
    capabilities: record.item.actions,
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
