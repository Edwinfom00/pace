import Link from "next/link";
import { MessageCircle, MoreHorizontal } from "lucide-react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { formatOverviewActivityDate } from "../../domain/overview-activity-formatters";
import type { OverviewInboxPreviewItem } from "../../domain/overview-activity.types";

const reasonLabels: Record<OverviewInboxPreviewItem["reason"], keyof DashboardLabels> = {
  UNKNOWN_CATEGORY: "overview.activity.reason.unknownCategory",
  POSSIBLE_TRANSFER: "overview.activity.reason.possibleTransfer",
  POSSIBLE_RECURRING: "overview.activity.reason.possibleRecurring",
  MERCHANT_AMBIGUITY: "overview.activity.reason.merchantAmbiguity",
  CLASSIFICATION_REVIEW: "overview.activity.reason.classificationReview",
};

export function InboxPreviewRow({
  item,
  labels,
  locale,
  timeZone,
  now,
  workspaceSlug,
}: {
  readonly item: OverviewInboxPreviewItem;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceSlug: string;
}) {
  const destination = "/w/" + workspaceSlug + "/inbox?item=" + encodeURIComponent(item.id);
  const date = formatOverviewActivityDate(
    item.occurredAt,
    now,
    locale,
    timeZone,
    labels["overview.activity.yesterday"],
  );

  return (
    <article className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 py-3 sm:grid-cols-[32px_minmax(130px,1fr)_96px_minmax(180px,1.15fr)_auto_28px] sm:gap-x-4 sm:py-2.5">
      <TransactionIcon
        iconKey={item.iconKey}
        merchantLogoKey={item.merchantLogoKey}
        merchantName={item.merchantName}
        size="sm"
        transactionKind={item.kind}
      />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#1b2844]">
          {item.merchantName ?? labels["overview.activity.unknownMerchant"]}
        </p>
        <p className="mt-1 truncate text-[12px] text-[#7b879e] sm:hidden">
          {date} <span aria-hidden="true">·</span> {labels[reasonLabels[item.reason]]}
        </p>
      </div>
      <p className="hidden text-[12px] text-[#7b879e] sm:block">{date}</p>
      <p className="hidden min-w-0 items-center gap-2 truncate text-[13px] text-[#667085] sm:flex">
        <MessageCircle aria-hidden="true" className="shrink-0 text-[#71809a]" size={15} strokeWidth={1.8} />
        <span className="truncate">{labels[reasonLabels[item.reason]]}</span>
      </p>
      <Link
        className="rounded-[7px] border border-[#dfe5ee] bg-white px-3 py-1.5 text-[12px] font-medium text-[#243552] shadow-[0_1px_1px_rgb(16_24_40/2%)] transition-colors hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        href={destination}
      >
        {labels["overview.activity.review"]}
      </Link>
      <Link
        aria-label={labels["overview.activity.moreActions"]}
        className="hidden size-7 items-center justify-center rounded-md text-[#53627b] transition-colors hover:bg-[#f3f5f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:inline-flex"
        href={destination}
      >
        <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
      </Link>
    </article>
  );
}
