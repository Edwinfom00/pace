import { CheckCircle2, History, Plus, Tag } from "lucide-react";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionDetailLabels } from "../transaction-detail-labels";
import { formatDetailTimestamp } from "./transaction-detail-formatters";

type ActivityEvent = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly occurredAt: string;
  readonly icon: typeof Plus;
  readonly tone: "neutral" | "success";
};

export function TransactionDetailActivity({
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
  const events: ActivityEvent[] = [
    {
      id: "created",
      title: labels.activity.added,
      description: transaction.source ? labels.source.origin[transaction.source.origin] : labels.activity.recorded,
      occurredAt: transaction.createdAt,
      icon: Plus,
      tone: "neutral",
    },
    ...(transaction.category ? [{
      id: "category",
      title: labels.activity.categorized(labels.systemCategory(transaction.category)),
      description: labels.activity.categoryAttached,
      occurredAt: transaction.updatedAt,
      icon: Tag,
      tone: "neutral" as const,
    }] : []),
    ...(transaction.status === "POSTED" ? [{
      id: "posted",
      title: labels.activity.posted,
      description: labels.activity.included,
      occurredAt: transaction.updatedAt,
      icon: CheckCircle2,
      tone: "success" as const,
    }] : []),
    ...(transaction.correction?.activity ? [{
      id: `correction-${transaction.correction.correctionId}`,
      title: labels.activity.correction,
      description: transaction.correction.reason ?? labels.activity.correctionDetails,
      occurredAt: transaction.correction.activity.occurredAt,
      icon: History,
      tone: "success" as const,
    }] : []),
    ...(transaction.reversal ? [{
      id: `reversal-${transaction.reversal.reversalTransactionId}`,
      title: labels.reversal.activity,
      description: transaction.reversal.reason ?? labels.reversal.activityDetails,
      occurredAt: transaction.reversal.reversedAt,
      icon: History,
      tone: "success" as const,
    }] : []),
    ...(transaction.refund?.activity.map((refund) => ({
      id: `refund-${refund.id}`,
      title: labels.activity.refundIssued(formatOverviewMoney(refund.amount.minor, refund.amount.currency, locale)),
      description: refund.reason ? refundReasonLabel(refund.reason, labels) : labels.activity.refundDetails,
      occurredAt: refund.occurredAt,
      icon: CheckCircle2,
      tone: "success" as const,
    })) ?? []),
  ];

  return (
    <section aria-labelledby="transaction-activity-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white p-4 sm:p-4.5">
      <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-activity-heading">{labels.activity.title}</h2>
      <ol className="mt-4 space-y-4">
        {events.map((event, index) => {
          const Icon = event.icon;
          return (
            <li className="relative flex gap-3" key={event.id}>
              {index < events.length - 1 ? <span aria-hidden className="absolute left-3.25 top-7 h-[calc(100%+0.5rem)] w-px bg-[#e6eaf0]" /> : null}
              <span className={event.tone === "success" ? "z-10 flex size-6.75 shrink-0 items-center justify-center rounded-full bg-[#eaf8f1] text-[#078652]" : "z-10 flex size-6.75 shrink-0 items-center justify-center rounded-full bg-[#f1f4f8] text-[#53627b]"}><Icon aria-hidden className="size-3.5" /></span>
              <div className="min-w-0 pb-0.5"><div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1"><p className="text-[13px] font-medium text-[#34405d]">{event.title}</p><time className="text-[11px] text-[#8190a7]" dateTime={event.occurredAt}>{formatDetailTimestamp(event.occurredAt, locale, timeZone)}</time></div><p className="mt-1 text-[12px] leading-5 text-[#71809a]">{event.description}</p></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function refundReasonLabel(reason: string, labels: TransactionDetailLabels): string {
  const refund = labels.refund;
  return ({ RETURNED_ITEM: refund.returnedItem, CANCELLED_SERVICE: refund.cancelledService, PRICE_ADJUSTMENT: refund.priceAdjustment, DUPLICATE_CHARGE: refund.duplicateCharge, OTHER: refund.other } as Record<string, string>)[reason] ?? reason;
}
