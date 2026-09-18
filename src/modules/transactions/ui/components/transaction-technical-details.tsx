import { Database, ChevronDown } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";
import { formatDetailTimestamp } from "./transaction-detail-formatters";

export function TransactionTechnicalDetails({
  transaction,
  labels,
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly labels: TransactionDetailLabels;
  readonly locale: string;
  readonly timeZone: string;
}) {
  return (
    <details className="group rounded-[12px] border border-[#e6eaf0] bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 text-[14px] font-medium text-[#34405d] marker:content-none sm:px-5">
        <ChevronDown aria-hidden className="size-4 text-[#637491] transition-transform group-open:rotate-180" />
        <span className="flex size-6 items-center justify-center rounded-[7px] bg-[#f1f4f8]"><Database aria-hidden className="size-3.5 text-[#53627b]" /></span>
        {labels.technical.title}
      </summary>
      <dl className="grid gap-x-6 gap-y-3 border-t border-[#edf0f4] px-4 py-4 text-[12px] sm:grid-cols-2 sm:px-5">
        <div><dt className="text-[#71809a]">{labels.technical.transactionId}</dt><dd className="mt-1 break-all font-mono text-[#34405d]">{transaction.id}</dd></div>
        <div><dt className="text-[#71809a]">{labels.technical.created}</dt><dd className="mt-1 text-[#34405d]"><time dateTime={transaction.createdAt}>{formatDetailTimestamp(transaction.createdAt, locale, timeZone)}</time></dd></div>
        <div><dt className="text-[#71809a]">{labels.technical.updated}</dt><dd className="mt-1 text-[#34405d]"><time dateTime={transaction.updatedAt}>{formatDetailTimestamp(transaction.updatedAt, locale, timeZone)}</time></dd></div>
        {transaction.correction ? <div><dt className="text-[#71809a]">{labels.technical.correctionId}</dt><dd className="mt-1 break-all font-mono text-[#34405d]">{transaction.correction.correctionId}</dd></div> : null}
        {transaction.correction ? <div><dt className="text-[#71809a]">{labels.technical.originalTransactionId}</dt><dd className="mt-1 break-all font-mono text-[#34405d]">{transaction.correction.originalTransactionId}</dd></div> : null}
        {transaction.correction ? <div><dt className="text-[#71809a]">{labels.technical.currentTransactionId}</dt><dd className="mt-1 break-all font-mono text-[#34405d]">{transaction.correction.currentTransactionId}</dd></div> : null}
      </dl>
    </details>
  );
}
