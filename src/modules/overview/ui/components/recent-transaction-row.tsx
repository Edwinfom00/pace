import Link from "next/link";
import { MoreHorizontal } from "lucide-react";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { formatOverviewActivityDate } from "../../domain/overview-activity-formatters";
import type { OverviewRecentTransaction } from "../../domain/overview-activity.types";
import { formatOverviewMoney } from "../../domain/overview-formatters";

export function RecentTransactionRow({
  transaction,
  labels,
  locale,
  timeZone,
  now,
  workspaceSlug,
}: {
  readonly transaction: OverviewRecentTransaction;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceSlug: string;
}) {
  const isPositive = transaction.kind === "INCOME" || transaction.kind === "REFUND";
  const isTransfer = transaction.kind === "TRANSFER";
  const amount = formatOverviewMoney(transaction.amountMinor, transaction.currency, locale);
  const formattedAmount = isTransfer
    ? labels["overview.activity.transfer"] + " · " + amount
    : (isPositive ? "+" : "-") + amount;
  const category = isTransfer
    ? labels["overview.activity.transfer"]
    : transaction.categoryName ?? labels["overview.activity.uncategorized"];
  const effectiveDate = formatOverviewActivityDate(
    transaction.effectiveAt,
    now,
    locale,
    timeZone,
    labels["overview.activity.yesterday"],
  );
  const transactionPath = "/w/" + workspaceSlug + "/transactions?transaction=" + encodeURIComponent(transaction.id);

  return (
    <article className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 py-3 sm:grid-cols-[32px_minmax(0,1fr)_102px_148px_132px_28px] sm:gap-x-4 sm:py-2.5">
      <TransactionIcon
        categoryKey={transaction.categoryKey}
        categoryName={transaction.categoryName}
        iconKey={transaction.iconKey}
        merchantName={transaction.merchantName}
        size="sm"
        transactionKind={transaction.kind}
      />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#1b2844]">
          {transaction.merchantName ?? labels["overview.activity.unknownMerchant"]}
        </p>
        <p className="mt-1 truncate text-[12px] text-[#7b879e] sm:hidden">
          {effectiveDate} <span aria-hidden="true">·</span> {category}
        </p>
      </div>
      <p className="hidden truncate text-[12px] text-[#7b879e] sm:block">{effectiveDate}</p>
      <p className={isPositive ? "whitespace-nowrap text-right text-[13px] font-semibold text-[#078652]" : "whitespace-nowrap text-right text-[13px] font-semibold text-[#1b2844]"}>
        {formattedAmount}
      </p>
      <span className="hidden w-fit max-w-full truncate rounded-full bg-[#f3f5f8] px-2.5 py-1 text-[12px] leading-4 text-[#667085] sm:block">
        {category}
      </span>
      <Link
        aria-label={labels["overview.activity.moreActions"]}
        className="hidden size-7 items-center justify-center rounded-md text-[#53627b] transition-colors hover:bg-[#f3f5f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] sm:inline-flex"
        href={transactionPath}
      >
        <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
      </Link>
    </article>
  );
}
