import { CalendarDays, CheckCircle2, Clock3, CreditCard, FileText, Tag, UserRound } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";
import { formatDetailDate, formatDetailTime } from "./transaction-detail-formatters";

type DetailRowProps = {
  readonly icon: typeof CalendarDays;
  readonly label: string;
  readonly children: React.ReactNode;
};

function DetailRow({ icon: Icon, label, children }: DetailRowProps) {
  return (
    <div className="grid grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] items-start gap-3 py-2.5 text-[13px] sm:grid-cols-[minmax(10.5rem,13.25rem)_minmax(0,1fr)]">
      <dt className="flex items-center gap-2.5 text-[#71809a]"><Icon aria-hidden className="size-4 text-[#637491]" strokeWidth={1.8} />{label}</dt>
      <dd className="min-w-0 wrap-break-word font-medium text-[#34405d]">{children}</dd>
    </div>
  );
}

export function TransactionDetailCard({
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
  const counterpartyLabel = transaction.kind === "INCOME" ? labels.field.source : labels.field.merchant;

  return (
    <section aria-labelledby="transaction-details-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white px-4 py-4 sm:px-5 sm:py-4.5">
      <div className="border-b border-[#edf0f4] pb-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-details-heading">{labels.title}</h2>
      </div>
      <dl className="divide-y divide-[#f0f2f5] pt-1">
        {transaction.kind === "TRANSFER" ? (
          <>
            {transaction.account ? <DetailRow icon={CreditCard} label={labels.field.fromAccount}>{transaction.account.name}</DetailRow> : null}
            {transaction.transferAccount ? <DetailRow icon={CreditCard} label={labels.field.toAccount}>{transaction.transferAccount.name}</DetailRow> : null}
          </>
        ) : (
          <>
            {transaction.merchant ? <DetailRow icon={UserRound} label={counterpartyLabel}>{transaction.merchant.name}</DetailRow> : null}
            {transaction.category ? <DetailRow icon={Tag} label={labels.field.category}><span className="inline-flex rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium text-[#596780]">{labels.systemCategory(transaction.category)}</span></DetailRow> : null}
            {transaction.account ? <DetailRow icon={CreditCard} label={labels.field.account}>{transaction.account.name}</DetailRow> : null}
          </>
        )}
        <DetailRow icon={CalendarDays} label={labels.field.date}><time dateTime={transaction.occurredAt}>{formatDetailDate(transaction.occurredAt, locale, timeZone)}</time></DetailRow>
        <DetailRow icon={Clock3} label={labels.field.time}>{formatDetailTime(transaction.occurredAt, locale, timeZone)}</DetailRow>
        {transaction.note ? <DetailRow icon={FileText} label={labels.field.note}><span className="font-normal text-[#53627b]">{transaction.note}</span></DetailRow> : null}
        <DetailRow icon={CheckCircle2} label={labels.field.status}><span className={transaction.reversal ? "inline-flex rounded-full bg-[#f1f4f8] px-2.5 py-1 text-[11px] font-medium text-[#53627b]" : transaction.status === "POSTED" ? "inline-flex rounded-full bg-[#eaf8f1] px-2.5 py-1 text-[11px] font-medium text-[#078652]" : "inline-flex rounded-full bg-[#fff5ec] px-2.5 py-1 text-[11px] font-medium text-[#b6642d]"}>{transaction.reversal ? labels.reversal.badge : labels.status[transaction.status]}</span></DetailRow>
        {transaction.reversal ? <DetailRow icon={CalendarDays} label={labels.reversal.reversedOn}><time dateTime={transaction.reversal.reversedAt}>{formatDetailDate(transaction.reversal.reversedAt, locale, timeZone)}</time></DetailRow> : null}
        {transaction.reversal?.reason ? <DetailRow icon={FileText} label={labels.reversal.reason}>{transaction.reversal.reason}</DetailRow> : null}
      </dl>
      {transaction.reversal ? <p className="mt-3 rounded-[8px] bg-[#f7f9fc] px-3 py-2.5 text-[12px] leading-5 text-[#53627b]">{labels.reversal.preserved}</p> : null}
    </section>
  );
}
