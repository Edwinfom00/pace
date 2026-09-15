import Link from "next/link";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { formatOverviewActivityHeaderDate } from "../../domain/overview-activity-formatters";
import type { OverviewRecentTransaction } from "../../domain/overview-activity.types";
import { RecentTransactionRow } from "./recent-transaction-row";

export function RecentTransactionsPreview({
  transactions,
  labels,
  locale,
  timeZone,
  now,
  workspaceSlug,
}: {
  readonly transactions: readonly OverviewRecentTransaction[];
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section aria-labelledby="overview-today-heading" className="pt-0.5">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="text-[21px] font-semibold tracking-[-0.03em] text-[#101a35]" id="overview-today-heading">
            {labels["overview.activity.today"]}
          </h2>
          <p className="truncate text-[13px] text-[#71809a]">
            {formatOverviewActivityHeaderDate(now, locale, timeZone)}
          </p>
        </div>
        <Link
          className="shrink-0 text-[13px] font-medium text-[#2563eb] transition-colors hover:text-[#1d4ed8] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          href={"/w/" + workspaceSlug + "/transactions"}
        >
          {labels["overview.activity.seeAll"]}
        </Link>
      </header>
      {transactions.length ? (
        <div className="mt-2 divide-y divide-[#edf0f4]">
          {transactions.map((transaction) => (
            <RecentTransactionRow
              key={transaction.id}
              labels={labels}
              locale={locale}
              now={now}
              timeZone={timeZone}
              transaction={transaction}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      ) : (
        <p className="py-5 text-[13px] text-[#71809a]">{labels["overview.activity.transactions.empty"]}</p>
      )}
    </section>
  );
}
