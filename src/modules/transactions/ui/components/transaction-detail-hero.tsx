import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight } from "lucide-react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import { formatDetailDate, formatDetailTime, formatTransactionDetailAmount, transactionKindLabel } from "./transaction-detail-formatters";

export function TransactionDetailHero({
  transaction,
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const title = transaction.merchant?.name ?? (transaction.kind === "TRANSFER" ? "Transfer" : transactionKindLabel(transaction.kind));
  const subtitle = transaction.kind === "TRANSFER"
    ? [transaction.account?.name, transaction.transferAccount?.name].filter(Boolean).join(" to ")
    : transaction.note ?? null;
  const TypeIcon = transaction.kind === "EXPENSE" ? ArrowDownLeft : transaction.kind === "INCOME" ? ArrowUpRight : ArrowRightLeft;
  const amountTone = transaction.kind === "INCOME" || transaction.kind === "REFUND" ? "text-[#078652]" : "text-[#101a35]";

  return (
    <header className="flex flex-col gap-5 border-b border-[#edf0f4] pb-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 items-start gap-4 sm:items-center">
        <TransactionIcon
          categoryKey={transaction.category?.systemKey ?? undefined}
          categoryName={transaction.category?.name}
          className="size-17 shrink-0 rounded-[17px] border-[#e4e9f0] bg-[#fff8ef] shadow-none [&_img]:size-8"
          iconKey={transaction.merchant?.iconKey}
          merchantLogoKey={transaction.merchant?.merchantLogoKey}
          merchantName={title}
          size="lg"
          transactionKind={transaction.kind}
        />
        <div className="min-w-0 pt-0.5">
          <h1 className="truncate text-[27px] font-semibold tracking-[-0.045em] text-[#101a35] sm:text-[30px]">{title}</h1>
          {subtitle ? <p className="mt-1 truncate text-[14px] text-[#71809a]">{subtitle}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3ff] px-2.5 py-1 text-[11px] font-medium text-[#365fba]">
              <TypeIcon aria-hidden className="size-3" />
              {transactionKindLabel(transaction.kind)}
            </span>
            {transaction.category ? <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium text-[#596780]">{transaction.category.name}</span> : null}
            {transaction.source?.label ? <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium text-[#596780]">Manual</span> : null}
          </div>
        </div>
      </div>
      <div className="shrink-0 sm:text-right">
        <p className={`text-[27px] font-semibold tabular-nums tracking-[-0.045em] sm:text-[30px] ${amountTone}`}>
          {formatTransactionDetailAmount(transaction.amount, transaction.kind, locale)}
        </p>
        <p className="mt-1 text-[13px] text-[#71809a]">
          {transaction.kind === "TRANSFER" ? "Transfer" : transaction.account?.name ?? "Account"}
          <span aria-hidden className="px-1.5 text-[#c0c8d5]">·</span>
          <time dateTime={transaction.occurredAt}>{formatDetailDate(transaction.occurredAt, locale, timeZone)}, {formatDetailTime(transaction.occurredAt, locale, timeZone)}</time>
        </p>
      </div>
    </header>
  );
}
