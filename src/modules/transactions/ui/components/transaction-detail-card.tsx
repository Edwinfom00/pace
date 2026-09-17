import { CalendarDays, CheckCircle2, Clock3, CreditCard, FileText, Tag, UserRound } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import { formatDetailDate, formatDetailTime, transactionStatusLabel } from "./transaction-detail-formatters";

type DetailRowProps = {
  readonly icon: typeof CalendarDays;
  readonly label: string;
  readonly children: React.ReactNode;
};

function DetailRow({ icon: Icon, label, children }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] items-start gap-3 py-2.5 text-[13px] sm:grid-cols-[13.25rem_minmax(0,1fr)]">
      <dt className="flex items-center gap-2.5 text-[#71809a]"><Icon aria-hidden className="size-4 text-[#637491]" strokeWidth={1.8} />{label}</dt>
      <dd className="min-w-0 break-words font-medium text-[#34405d]">{children}</dd>
    </div>
  );
}

export function TransactionDetailCard({
  transaction,
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const counterpartyLabel = transaction.kind === "INCOME" ? "Source" : "Merchant";

  return (
    <section aria-labelledby="transaction-details-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white px-4 py-4 sm:px-5 sm:py-4.5">
      <div className="border-b border-[#edf0f4] pb-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-details-heading">Transaction details</h2>
      </div>
      <dl className="divide-y divide-[#f0f2f5] pt-1">
        {transaction.kind === "TRANSFER" ? (
          <>
            {transaction.account ? <DetailRow icon={CreditCard} label="From account">{transaction.account.name}</DetailRow> : null}
            {transaction.transferAccount ? <DetailRow icon={CreditCard} label="To account">{transaction.transferAccount.name}</DetailRow> : null}
          </>
        ) : (
          <>
            {transaction.merchant ? <DetailRow icon={UserRound} label={counterpartyLabel}>{transaction.merchant.name}</DetailRow> : null}
            {transaction.category ? <DetailRow icon={Tag} label="Category"><span className="inline-flex rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium text-[#596780]">{transaction.category.name}</span></DetailRow> : null}
            {transaction.account ? <DetailRow icon={CreditCard} label="Account">{transaction.account.name}</DetailRow> : null}
          </>
        )}
        <DetailRow icon={CalendarDays} label="Date"><time dateTime={transaction.occurredAt}>{formatDetailDate(transaction.occurredAt, locale, timeZone)}</time></DetailRow>
        <DetailRow icon={Clock3} label="Time">{formatDetailTime(transaction.occurredAt, locale, timeZone)}</DetailRow>
        {transaction.note ? <DetailRow icon={FileText} label="Note"><span className="font-normal text-[#53627b]">{transaction.note}</span></DetailRow> : null}
        <DetailRow icon={CheckCircle2} label="Status"><span className={transaction.status === "POSTED" ? "inline-flex rounded-full bg-[#eaf8f1] px-2.5 py-1 text-[11px] font-medium text-[#078652]" : "inline-flex rounded-full bg-[#fff5ec] px-2.5 py-1 text-[11px] font-medium text-[#b6642d]"}>{transactionStatusLabel(transaction.status)}</span></DetailRow>
      </dl>
    </section>
  );
}
