import type { TransactionListItem } from "../../types/transaction-ui.types";
import { formatTransactionDate, type TransactionDateLabels } from "./transaction-formatters";

export function TransactionDateCell({
  occurredAt,
  now,
  locale,
  timeZone,
  labels,
}: {
  readonly occurredAt: TransactionListItem["occurredAt"];
  readonly now: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: TransactionDateLabels;
}) {
  return (
    <time className="whitespace-nowrap text-[12px] text-[#667895]" dateTime={occurredAt}>
      {formatTransactionDate(occurredAt, now, locale, timeZone, labels)}
    </time>
  );
}
