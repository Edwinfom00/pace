import type { InboxCategoryResolutionResult } from "./financial-inbox-service";

export type InboxCategoryResolutionResponse = {
  readonly inboxItemId: string;
  readonly inboxItemStatus: InboxCategoryResolutionResult["item"]["status"];
  readonly inboxItemUpdatedAt: string;
  readonly transactionId: string;
  readonly transactionUpdatedAt: string;
  readonly categoryId: string | null;
  readonly resolvedInboxItemIds: readonly string[];
  readonly unresolvedReasons: InboxCategoryResolutionResult["unresolvedReasons"];
  readonly replayed: boolean;
};

/** A JSON-safe mutation acknowledgement; financial transaction fields stay server-side. */
export function presentInboxCategoryResolution(
  result: InboxCategoryResolutionResult,
): InboxCategoryResolutionResponse {
  return {
    inboxItemId: result.item.id,
    inboxItemStatus: result.item.status,
    inboxItemUpdatedAt: result.item.updatedAt.toISOString(),
    transactionId: result.transaction.id,
    transactionUpdatedAt: result.transaction.updatedAt.toISOString(),
    categoryId: result.transaction.categoryId,
    resolvedInboxItemIds: result.resolvedInboxItemIds,
    unresolvedReasons: result.unresolvedReasons,
    replayed: result.replayed,
  };
}
