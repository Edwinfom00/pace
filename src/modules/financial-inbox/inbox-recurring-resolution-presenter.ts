import type { InboxRecurringResolutionResult } from "./financial-inbox-service";

export type InboxRecurringResolutionResponse = {
  readonly inboxItem: {
    readonly id: string;
    readonly status: InboxRecurringResolutionResult["item"]["status"];
    readonly updatedAt: string;
  };
  readonly recurring: InboxRecurringResolutionResult["recurring"];
  readonly resolvedInboxItemIds: readonly string[];
  readonly unresolvedReasons: InboxRecurringResolutionResult["unresolvedReasons"];
  readonly replayed: boolean;
};

export function presentInboxRecurringResolution(
  result: InboxRecurringResolutionResult,
): InboxRecurringResolutionResponse {
  return {
    inboxItem: {
      id: result.item.id,
      status: result.item.status,
      updatedAt: result.item.updatedAt.toISOString(),
    },
    recurring: result.recurring,
    resolvedInboxItemIds: result.resolvedInboxItemIds,
    unresolvedReasons: result.unresolvedReasons,
    replayed: result.replayed,
  };
}
