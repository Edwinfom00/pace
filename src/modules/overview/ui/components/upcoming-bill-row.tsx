import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";

import type { OverviewUpcomingBill } from "../../domain/overview-right-rail";
import { formatOverviewRightRailDate } from "../../domain/overview-right-rail-formatters";
import { formatOverviewMoney } from "../../domain/overview-formatters";

export function UpcomingBillRow({
  bill,
  locale,
  timeZone,
}: {
  readonly bill: OverviewUpcomingBill;
  readonly locale: string;
  readonly timeZone: string;
}) {
  return (
    <article className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <TransactionIcon iconKey={bill.iconKey} merchantName={bill.merchantName} size="sm" transactionKind="EXPENSE" />
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-medium text-[#263149]">{bill.merchantName}</h3>
        <p className="mt-0.5 text-[12px] text-[#71809a]">{formatOverviewRightRailDate(bill.nextExpectedAt, locale, timeZone)}</p>
      </div>
      <p className="whitespace-nowrap text-right text-[13px] font-semibold text-[#263149]">
        {formatOverviewMoney(bill.amountMinor, bill.currency, locale)}
      </p>
    </article>
  );
}
