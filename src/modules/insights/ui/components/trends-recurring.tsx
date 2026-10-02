"use client";

import Link from "next/link";
import { FiArrowRight } from "react-icons/fi";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";

import type { InsightsTrends } from "../../trends/insights-trends.types";
import {
  formatInsightsMoney,
  formatInsightsMonth,
  formatInsightsShare,
} from "../insights-format";
import { insightsRecurringHref } from "../insights-links";
import {
  cashFlowChartData,
  hasRecurringSpending,
  trendsQueryState,
  type CashFlowChartDatum,
} from "../trends-format";

const RECURRING_COLOR = "#1769e8";

export function TrendsRecurring({
  labels,
  trends,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly workspaceSlug: string;
}) {
  const data = cashFlowChartData(trends.months, trends.currency, trends.locale);
  const hasData = hasRecurringSpending(trends.months);
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);

  return (
    <section
      aria-labelledby="trends-recurring-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
            id="trends-recurring-title">
            {labels["insights.trends.recurring.title"]}
          </h2>
          <p className="text-[12px] leading-5 text-[#71809a]">
            {labels["insights.trends.recurring.description"]}
          </p>
        </div>
        {hasData ? (
          <p className="shrink-0 text-[13px] font-semibold text-[#1c2740] tabular-nums">
            {money(trends.totals.recurring.minor)}
          </p>
        ) : null}
      </div>
      {hasData ? (
        <>
          <p className="mt-1 text-[12px] leading-5 text-[#44516a] tabular-nums">
            {formatDashboardLabel(labels, "insights.trends.recurring.share", {
              share: formatInsightsShare(
                trends.recurring.shareBps,
                trends.locale,
              ),
              count: trends.recurring.paymentCount,
            })}
          </p>
          <div aria-hidden="true" className="mt-3 h-32 min-w-0">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                barCategoryGap="24%"
                data={data}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval="preserveStartEnd"
                  tick={{ fill: "#7b879e", fontSize: 11 }}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const datum = payload?.[0]?.payload as
                      | CashFlowChartDatum
                      | undefined;
                    if (!active || !datum || datum.isFuture) return null;
                    return (
                      <div className="rounded-[10px] border border-[#e1e8f2] bg-white px-3 py-2 text-[12px] shadow-[0_10px_24px_rgb(20_44_84/12%)]">
                        <p className="font-semibold text-[#1c2740]">
                          {formatInsightsMonth(
                            datum.month,
                            trends.locale,
                            "long",
                          )}
                        </p>
                        <p className="mt-0.5 text-[#44516a] tabular-nums">
                          {money(datum.recurringMinor)}
                        </p>
                      </div>
                    );
                  }}
                  cursor={{ fill: "#f3f6fb" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="recurring"
                  fill={RECURRING_COLOR}
                  isAnimationActive={false}
                  maxBarSize={16}
                  radius={[3, 3, 0, 0]}>
                  {data.map((datum) => (
                    <Cell
                      fillOpacity={datum.isPartial ? 0.55 : 1}
                      key={datum.month}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{labels["insights.trends.recurring.title"]}</caption>
            <tbody>
              {data
                .filter((datum) => !datum.isFuture)
                .map((datum) => (
                  <tr key={datum.month}>
                    <th scope="row">
                      {formatInsightsMonth(datum.month, trends.locale, "long")}
                    </th>
                    <td>{money(datum.recurringMinor)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="py-8 text-center text-[13px] leading-5 text-[#667085]">
          {labels["insights.trends.recurring.empty"]}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-4 text-[#8a96ab]">
        {labels["insights.trends.recurring.note"]}
      </p>
      <Link
        className="mt-2 inline-flex items-center gap-1 rounded-sm text-[12px] leading-5 font-medium text-[#1769e8] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
        href={insightsRecurringHref(workspaceSlug, trendsQueryState(trends))}>
        {labels["insights.recurring.view"]}
        <FiArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </section>
  );
}
