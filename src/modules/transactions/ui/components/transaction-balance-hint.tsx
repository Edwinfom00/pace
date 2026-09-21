import type { TransactionAccountOption } from "./transaction-account.types";
import {
  accountBalanceText,
  formatTransactionBalance,
  transactionBalanceAfter,
  type TransactionBalanceLabels,
} from "./transaction-balance";

export function TransactionBalanceHint({
  account,
  amount,
  balanceKind,
  direction,
  labels,
  locale,
}: {
  readonly account: TransactionAccountOption | undefined;
  readonly amount?: string;
  readonly balanceKind: "available" | "current";
  readonly direction?: "credit" | "debit";
  readonly labels: TransactionBalanceLabels;
  readonly locale: string;
}) {
  if (!account) return null;
  const balance = accountBalanceText(account, locale, labels, balanceKind);
  if (!balance) return <span>{labels.unavailable}</span>;

  const projected = amount && direction
    ? transactionBalanceAfter(account, amount, account.currency, direction)
    : null;
  const projectedText = projected
    ? formatTransactionBalance(projected.minor, projected.currency, locale)
    : null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
      <span className="min-w-0 truncate">{balance}</span>
      {projectedText ? <span className="text-[#60708a]">{labels.afterTransaction} · {projectedText}</span> : null}
    </span>
  );
}
