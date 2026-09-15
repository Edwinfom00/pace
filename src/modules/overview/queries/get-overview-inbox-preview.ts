import type { AuthenticatedActor } from "@/authorization/session";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { getFinancialInboxService } from "@/modules/financial-inbox/server";

import type { OverviewInboxPreview } from "../domain/overview-activity.types";

export interface GetOverviewInboxPreviewInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly limit?: number;
}

export async function getOverviewInboxPreview({
  actor,
  workspaceId,
  limit = 4,
}: GetOverviewInboxPreviewInput): Promise<OverviewInboxPreview> {
  const previewLimit = Math.min(Math.max(Math.floor(limit), 1), 12);
  const preview = await getFinancialInboxService().listInboxPreview(actor, workspaceId, previewLimit);

  return {
    unresolvedCount: preview.unresolvedCount,
    items: preview.items.map((item) => ({
      id: item.id,
      transactionId: item.transaction.id,
      merchantName: item.transaction.merchantName,
      occurredAt: item.transaction.occurredAt,
      reason: item.reason,
      kind: item.transaction.kind,
      iconKey: resolveTransactionIcon({
        merchantName: item.transaction.merchantName,
        transactionKind: item.transaction.kind,
      }).iconKey,
    })),
  };
}
