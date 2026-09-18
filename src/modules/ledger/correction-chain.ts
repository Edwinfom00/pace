import type { LedgerTransactionRecord } from "./domain";


export function isCurrentFinancialTransaction(
  transaction: Pick<LedgerTransactionRecord, "id" | "reversalOfTransactionId">,
  transactions: readonly Pick<LedgerTransactionRecord, "id" | "reversalOfTransactionId">[],
): boolean {
  if (transaction.reversalOfTransactionId != null) return false;
  return !transactions.some((candidate) => candidate.reversalOfTransactionId === transaction.id);
}

export function currentFinancialTransactions<T extends Pick<LedgerTransactionRecord, "id" | "reversalOfTransactionId">>(
  transactions: readonly T[],
): T[] {
  const reversedIds = new Set(
    transactions.flatMap((transaction) =>
      transaction.reversalOfTransactionId == null ? [] : [transaction.reversalOfTransactionId],
    ),
  );
  return transactions.filter(
    (transaction) => transaction.reversalOfTransactionId == null && !reversedIds.has(transaction.id),
  );
}
