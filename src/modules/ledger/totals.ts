import type { LedgerTransactionRecord } from "./domain";

export interface IncomeAndSpendingTotals {
  incomeMinor: bigint;
  spendingMinor: bigint;
}

/**
 * Produces a same-currency reporting total. Transfers intentionally have no
 * effect: moving money between accounts is neither income nor spending.
 */
export function calculateIncomeAndSpendingTotals(
  transactions: readonly LedgerTransactionRecord[],
  currency: string,
): IncomeAndSpendingTotals {
  return transactions.reduce<IncomeAndSpendingTotals>(
    (totals, transaction) => {
      if (transaction.status !== "POSTED" || transaction.currency !== currency) return totals;
      if (transaction.kind === "INCOME") {
        return { ...totals, incomeMinor: totals.incomeMinor + transaction.amountMinor };
      }
      if (transaction.kind === "EXPENSE") {
        return { ...totals, spendingMinor: totals.spendingMinor + transaction.amountMinor };
      }
      if (transaction.kind === "REFUND") {
        return { ...totals, spendingMinor: totals.spendingMinor - transaction.amountMinor };
      }
      return totals;
    },
    { incomeMinor: 0n, spendingMinor: 0n },
  );
}
