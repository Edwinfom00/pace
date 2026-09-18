import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionRefundLabels } from "../transaction-refund-labels";

export function TransactionRefundSummary({
  labels,
  locale,
  transaction,
  workspaceSlug,
}: {
  readonly labels: TransactionRefundLabels;
  readonly locale: string;
  readonly transaction: TransactionDetailData;
  readonly workspaceSlug: string;
}) {
  const summary = transaction.refund;
  if (!summary || summary.status === "NONE") return null;
  const formatted = (money: { readonly currency: string; readonly minor: string }) => formatOverviewMoney(money.minor, money.currency, locale);
  const status = summary.status === "FULL" ? labels.fullyRefundedState : labels.partial;

  return (
    <section aria-labelledby="transaction-refund-summary-heading" className="rounded-[13px] border border-[#dfe7f2] bg-[#fcfdff] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8edf4] pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#eaf8f1] text-[#078652]"><CircleCheck aria-hidden="true" className="size-4" /></span>
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-refund-summary-heading">{labels.title}</h2>
            <p className="mt-0.5 text-[12px] text-[#53627b]">{status}</p>
          </div>
        </div>
        <span className="inline-flex rounded-full bg-[#edf3ff] px-2.5 py-1 text-[11px] font-medium text-[#365fba]">{summary.status === "FULL" ? labels.full : labels.partial}</span>
      </div>
      <dl className="mt-3 grid gap-2.5 text-[13px] sm:grid-cols-3 sm:gap-x-6">
        <SummaryValue label={labels.originalAmount} value={formatted(summary.effectiveExpenseAmount)} />
        <SummaryValue label={labels.alreadyRefunded} value={formatted(summary.refundedAmount)} />
        <SummaryValue emphasized label={labels.remaining} value={formatted(summary.remainingRefundableAmount)} />
      </dl>
      {summary.refunds.length ? (
        <ul className="mt-3 divide-y divide-[#edf0f4] border-t border-[#e8edf4] pt-1" aria-label={labels.title}>
          {summary.refunds.map((refund) => (
            <li className="flex items-center justify-between gap-3 py-2.5" key={refund.id}>
              <span className="min-w-0"><span className="block text-[13px] font-medium text-[#34405d]">{formatted(refund.amount)}</span>{refund.reason ? <span className="mt-0.5 block truncate text-[11px] text-[#71809a]">{refundReasonLabel(refund.reason, labels)}</span> : null}</span>
              <Link className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#245ec4] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" href={`/w/${workspaceSlug}/transactions/${refund.id}`}>{labels.viewRefund}<ArrowRight aria-hidden="true" className="size-3.5" /></Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SummaryValue({ label, value, emphasized = false }: { readonly label: string; readonly value: string; readonly emphasized?: boolean }) {
  return <div><dt className="text-[12px] text-[#71809a]">{label}</dt><dd className={`mt-1 tabular-nums ${emphasized ? "font-semibold text-[#172d56]" : "font-medium text-[#34405d]"}`}>{value}</dd></div>;
}

function refundReasonLabel(reason: string, labels: TransactionRefundLabels): string {
  return ({ RETURNED_ITEM: labels.returnedItem, CANCELLED_SERVICE: labels.cancelledService, PRICE_ADJUSTMENT: labels.priceAdjustment, DUPLICATE_CHARGE: labels.duplicateCharge, OTHER: labels.other } as Record<string, string>)[reason] ?? reason;
}
