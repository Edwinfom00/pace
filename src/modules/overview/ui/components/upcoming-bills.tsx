import Link from "next/link";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import { overviewUpcomingBillsPath, type OverviewUpcomingBill } from "../../domain/overview-right-rail";
import { UpcomingBillRow } from "./upcoming-bill-row";

export function UpcomingBills({
  bills,
  unavailable,
  labels,
  locale,
  timeZone,
  workspaceSlug,
}: {
  readonly bills: readonly OverviewUpcomingBill[] | null;
  readonly unavailable: boolean;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section aria-labelledby="overview-upcoming-bills-heading" className="border-t border-[#edf0f4] px-5 py-5 sm:px-6">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#101a35]" id="overview-upcoming-bills-heading">
          {labels["overview.upcomingBills.title"]}
        </h2>
        <Link
          aria-label={`${labels["overview.upcomingBills.seeAll"]} ${labels["overview.upcomingBills.title"].toLocaleLowerCase()}`}
          className="shrink-0 text-[12px] font-medium text-[#2563eb] transition-colors hover:text-[#1d4ed8] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          href={overviewUpcomingBillsPath(workspaceSlug)}
        >
          {labels["overview.upcomingBills.seeAll"]}
        </Link>
      </header>
      {unavailable ? (
        <p className="pt-4 text-[13px] leading-5 text-[#71809a]" role="status">{labels["overview.upcomingBills.error"]}</p>
      ) : bills?.length ? (
        <div className="mt-4 divide-y divide-[#edf0f4]">{bills.map((bill) => <UpcomingBillRow bill={bill} key={bill.recurringId} locale={locale} timeZone={timeZone} />)}</div>
      ) : (
        <p className="pt-4 text-[13px] leading-5 text-[#71809a]">{labels["overview.upcomingBills.empty"]}</p>
      )}
    </section>
  );
}
