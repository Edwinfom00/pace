import Link from "next/link";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";

import type { InsightsRecurring } from "../../recurring/insights-recurring.types";
import { formatInsightsMoney } from "../insights-format";
import { recurringDetailHref, transactionDetailHref } from "../insights-links";
import { recurringItemName } from "../recurring-format";

export function RecurringPriceChanges({
  labels,
  recurring,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
  readonly workspaceSlug: string;
}) {
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);

  return (
    <section
      aria-labelledby="recurring-price-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2
        className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
        id="recurring-price-title">
        {labels["insights.recurring.priceChanges.title"]}
      </h2>
      <p className="text-[12px] leading-5 text-[#71809a]">
        {labels["insights.recurring.priceChanges.description"]}
      </p>
      {recurring.priceChanges.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {recurring.priceChanges.map((change) => {
            const isUp = !change.deltaMinor.startsWith("-");
            const costlier = change.flow === "OUTFLOW" ? isUp : !isUp;
            return (
              <li className="flex items-start gap-3 py-2.5" key={change.recurringId}>
                <div className="min-w-0 flex-1">
                  <Link
                    className="block truncate rounded-sm text-[13px] leading-5 font-medium text-[#1c2740] outline-none hover:text-[#1769e8] hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                    href={recurringDetailHref(workspaceSlug, change.recurringId)}>
                    {recurringItemName(change.name, labels)}
                  </Link>
                  <p className="text-[12px] leading-5 text-[#71809a] tabular-nums">
                    {formatDashboardLabel(
                      labels,
                      "insights.recurring.priceChanges.from",
                      { amount: money(change.previousMinor) },
                    )}
                    {" · "}
                    <Link
                      className="rounded-sm text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                      href={transactionDetailHref(
                        workspaceSlug,
                        change.transactionId,
                      )}>
                      {formatDashboardLabel(
                        labels,
                        "insights.recurring.priceChanges.charged",
                        {
                          date: formatOverviewDate(
                            change.changedDate,
                            recurring.locale,
                          ),
                        },
                      )}
                    </Link>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] leading-5 font-semibold text-[#1c2740] tabular-nums">
                    {money(change.currentMinor)}
                  </p>
                  <p
                    className={cn(
                      "text-[12px] leading-4.5 font-medium tabular-nums",
                      costlier ? "text-[#c9483c]" : "text-[#0b8c5a]",
                    )}>
                    <span aria-hidden="true">{isUp ? "↑" : "↓"} </span>
                    {change.percentage}%
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] leading-5 text-[#667085]">
          {labels["insights.recurring.priceChanges.empty"]}
        </p>
      )}
    </section>
  );
}
