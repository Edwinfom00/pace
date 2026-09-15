import type { AuthenticatedActor } from "@/authorization/session";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { getLedgerService } from "@/modules/ledger/server";

import type { OverviewRecentTransaction } from "../domain/overview-activity.types";

export interface GetOverviewRecentTransactionsInput {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly limit?: number;
}

export async function getOverviewRecentTransactions({
  actor,
  workspaceId,
  limit = 4,
}: GetOverviewRecentTransactionsInput): Promise<readonly OverviewRecentTransaction[]> {
  const previewLimit = Math.min(Math.max(Math.floor(limit), 1), 12);
  const transactions = await getLedgerService().listTransactions(actor, workspaceId, {
    limit: previewLimit,
  });
  const repository = new DatabaseLedgerRepository();
  const details = await Promise.all(
    transactions.map(async (transaction) => {
      const [merchant, category] = await Promise.all([
        transaction.merchantId
          ? repository.findMerchant(workspaceId, transaction.merchantId)
          : Promise.resolve(null),
        transaction.categoryId
          ? repository.findCategory(workspaceId, transaction.categoryId)
          : Promise.resolve(null),
      ]);
      const merchantName = merchant?.name ?? transaction.note?.trim() ?? null;
      const icon = resolveTransactionIcon({
        merchantName,
        categoryName: category?.name,
        categoryKey: category?.systemKey,
        transactionKind: transaction.kind,
      });

      return {
        id: transaction.id,
        merchantName,
        amountMinor: transaction.amountMinor.toString(),
        currency: transaction.currency,
        kind: transaction.kind,
        effectiveAt: transaction.occurredAt.toISOString(),
        categoryName: category?.name ?? null,
        categoryKey: category?.systemKey ?? null,
        iconKey: icon.iconKey,
        status: transaction.status,
      };
    }),
  );

  return details;
}
