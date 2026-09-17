import { CheckCircle2, Plus, Tag } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

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
  locale,
  timeZone,
}: {
  readonly transaction: TransactionDetailData;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const events: ActivityEvent[] = [
    {
      id: "created",
      title: "Transaction added",
      description: transaction.source?.label ?? "Recorded in Pace",
      occurredAt: transaction.createdAt,
      icon: Plus,
      tone: "neutral",
    },
    ...(transaction.category ? [{
      id: "category",
      title: `Categorized as ${transaction.category.name}`,
      description: "Category currently attached to this transaction",
      occurredAt: transaction.updatedAt,
      icon: Tag,
      tone: "neutral" as const,
    }] : []),
    ...(transaction.status === "POSTED" ? [{
      id: "posted",
      title: "Verified and posted",
      description: "Included in your account activity",
      occurredAt: transaction.updatedAt,
      icon: CheckCircle2,
      tone: "success" as const,
    }] : []),
  ];

  return (
    <section aria-labelledby="transaction-activity-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white p-4 sm:p-4.5">
      <h2 className="text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-activity-heading">Activity</h2>
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
