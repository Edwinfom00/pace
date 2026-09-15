import { cn } from "@/lib/utils";

import type { TransactionListItem } from "../../types/transaction-ui.types";
import { formatTransactionAmount, transactionAmountTone } from "./transaction-formatters";

export function TransactionAmountCell({
  amount,
  kind,
  locale,
}: {
  readonly amount: TransactionListItem["amount"];
  readonly kind: TransactionListItem["kind"];
  readonly locale: string;
}) {
  const tone = transactionAmountTone(kind);
  const spokenDirection = tone === "positive" ? "Incoming" : kind === "EXPENSE" ? "Outgoing" : "Transfer";

  return (
    <span
      aria-label={`${spokenDirection}: ${formatTransactionAmount(amount, kind, locale)}`}
      className={cn(
        "whitespace-nowrap text-right text-[13px] font-semibold tabular-nums tracking-[-0.01em]",
        tone === "positive" ? "text-[#078652]" : "text-[#1b2844]",
      )}
    >
      {formatTransactionAmount(amount, kind, locale)}
    </span>
  );
}
