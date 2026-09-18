import { ArrowDownLeft, ArrowUpRight, CreditCard, ReceiptText } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";
import { formatDetailMonth, formatTransactionDetailAmount } from "./transaction-detail-formatters";

export function TransactionFinancialContext({
  transaction,
  labels,
  locale,
}: {
  readonly transaction: TransactionDetailData;
  readonly labels: TransactionDetailLabels;
  readonly locale: string;
}) {
  const { accountImpacts, monthlyCategory } = transaction.context;

  return (
    <section aria-labelledby="financial-context-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white p-4 sm:p-5">
      <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="financial-context-heading">{labels.financial.title}</h2>
      {monthlyCategory || accountImpacts.length ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {monthlyCategory ? (
            <article className="rounded-[10px] border border-[#e9edf3] bg-[#fcfdff] p-3.5">
              <div className="flex items-center gap-2.5 text-[12px] font-medium text-[#53627b]"><span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#f1f4f8]"><ReceiptText aria-hidden className="size-4" /></span>{labels.financial.categoryThisMonth(labels.systemCategory({ name: monthlyCategory.categoryName, systemKey: monthlyCategory.categorySystemKey }))}</div>
              <p className="mt-3 text-[18px] font-semibold tabular-nums tracking-[-0.03em] text-[#1b2844]">{formatTransactionDetailAmount(monthlyCategory.total, monthlyCategory.direction === "SPENDING" ? "EXPENSE" : "INCOME", locale)}</p>
              <p className="mt-1 text-[12px] text-[#71809a]">{monthlyCategory.direction === "SPENDING" ? labels.financial.recordedSpending(formatDetailMonth(monthlyCategory.period, locale)) : labels.financial.recordedIncome(formatDetailMonth(monthlyCategory.period, locale))}</p>
            </article>
          ) : null}
          {accountImpacts.map((impact) => {
            const DirectionIcon = impact.direction === "INCREASE" ? ArrowUpRight : ArrowDownLeft;
            return (
              <article className="rounded-[10px] border border-[#e9edf3] bg-[#fcfdff] p-3.5" key={impact.account.id}>
                <div className="flex items-center gap-2.5 text-[12px] font-medium text-[#53627b]">
                  <span className="flex size-7 items-center justify-center rounded-[8px] bg-[#f1f4f8]"><CreditCard aria-hidden className="size-4" />
                  </span>{labels.financial.accountImpact}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[#1b2844]">{impact.account.name}</p>
                    <p className="mt-1 text-[12px] text-[#71809a]">{labels.financial.balanceAfter}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={impact.direction === "INCREASE" ? "flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums text-[#078652]" : "flex items-center justify-end gap-1 text-[13px] font-semibold tabular-nums text-[#c13f4d]"}>
                      <DirectionIcon aria-hidden className="size-3.5" />{impact.direction === "INCREASE" ? "+" : "−"}{formatTransactionDetailAmount(impact.effect, "TRANSFER", locale)}
                    </p>
                    <p className="mt-1 text-[12px] font-medium tabular-nums text-[#53627b]">{formatTransactionDetailAmount(impact.balanceAfter, "TRANSFER", locale)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="mt-3 rounded-[10px] border border-dashed border-[#e4e9f0] px-3.5 py-4 text-[13px] text-[#71809a]">{labels.financial.empty}</p>}
    </section>
  );
}
