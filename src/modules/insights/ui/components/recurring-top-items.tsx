import Link from "next/link";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewDate } from "@/modules/overview/domain/overview-formatters";

import type {
  InsightsRecurring,
  RecurringTopItem,
} from "../../recurring/insights-recurring.types";
import {
  categoryBarWidth,
  formatInsightsMoney,
  formatInsightsShare,
} from "../insights-format";
import { recurringDetailHref, transactionDetailHref } from "../insights-links";
import { recurringItemName } from "../recurring-format";

export function RecurringTopItems({
  labels,
  recurring,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
  readonly workspaceSlug: string;
}) {
  const { outflows, inflows } = recurring.topItems;
  const groups = [
    {
      key: "outflows",
      title: labels["insights.recurring.top.outflows"],
      items: outflows,
    },
    {
      key: "inflows",
      title: labels["insights.recurring.top.inflows"],
      items: inflows,
    },
  ].filter((group) => group.items.length > 0);

  return (
    <section
      aria-labelledby="recurring-top-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2
        className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
        id="recurring-top-title">
        {labels["insights.recurring.top.title"]}
        <span className="rounded-[4px] bg-[#eef4ff] px-1.5 text-[10px] leading-4.5 font-semibold tracking-wide text-[#1d5fd0] uppercase">
          {labels["insights.recurring.actual"]}
        </span>
      </h2>
      <p className="text-[12px] leading-5 text-[#71809a]">
        {labels["insights.recurring.top.description"]}
      </p>
      {groups.length ? (
        <div className="mt-2 space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {groups.length > 1 ? (
                <h3 className="pt-1 text-[12px] leading-5 font-semibold text-[#5d6b84]">
                  {group.title}
                </h3>
              ) : null}
              <ul className="divide-y divide-[#edf0f4]">
                {group.items.map((item) => (
                  <TopItemRow
                    item={item}
                    key={item.id}
                    labels={labels}
                    recurring={recurring}
                    workspaceSlug={workspaceSlug}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-[13px] leading-5 text-[#667085]">
          {labels["insights.recurring.top.empty"]}
        </p>
      )}
    </section>
  );
}

function TopItemRow({
  item,
  labels,
  recurring,
  workspaceSlug,
}: {
  readonly item: RecurringTopItem;
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
  readonly workspaceSlug: string;
}) {
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);
  const isInflow = item.flow === "INFLOW";
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Link
            className="block truncate rounded-sm text-[13px] leading-5 font-medium text-[#1c2740] outline-none hover:text-[#1769e8] hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
            href={recurringDetailHref(workspaceSlug, item.id)}>
            {recurringItemName(item.name, labels)}
          </Link>
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12px] leading-5 text-[#71809a]">
            <span className="tabular-nums">
              {formatDashboardLabel(labels, "insights.recurring.top.payments", {
                count: item.paymentCount,
                amount: money(item.typicalAmountMinor),
              })}
            </span>
            {item.lifecycle === "PAUSED" ? (
              <span className="rounded-[4px] bg-[#f2f4f7] px-1 text-[11px] leading-4 font-medium text-[#5d6b84]">
                {labels["insights.recurring.top.paused"]}
              </span>
            ) : null}
            {item.latestTransactionId && item.latestDate ? (
              <>
                <span aria-hidden="true">·</span>
                <Link
                  aria-label={`${labels["insights.recurring.top.latest"]}: ${formatOverviewDate(item.latestDate, recurring.locale)}`}
                  className="rounded-sm text-[#2166dc] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                  href={transactionDetailHref(
                    workspaceSlug,
                    item.latestTransactionId,
                  )}>
                  {formatOverviewDate(item.latestDate, recurring.locale)}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-[13px] leading-5 font-semibold tabular-nums",
              isInflow ? "text-[#0b8c5a]" : "text-[#1c2740]",
            )}>
            {money(item.actualMinor)}
          </p>
          <p className="text-[11px] leading-4 text-[#8a96ab] tabular-nums">
            {formatInsightsShare(item.shareBps, recurring.locale)}
          </p>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#f0f3f8]">
        <div
          className={cn(
            "h-full rounded-full",
            isInflow ? "bg-[#7fc4a4]" : "bg-[#1769e8]",
          )}
          style={{ width: categoryBarWidth(item.shareBps) }}
        />
      </div>
    </li>
  );
}
