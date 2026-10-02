"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCompactOverviewAmount } from "@/modules/overview/domain/overview-formatters";

import type { InsightsOverview } from "../../overview/insights-overview.types";
import {
  formatInsightsMoney,
  formatInsightsMonth,
  hasIncomeOrSpending,
  incomeSpendingChartData,
  type IncomeSpendingChartDatum,
} from "../insights-format";

const INCOME_COLOR = "#8fb4ef";
const SPENDING_COLOR = "#1769e8";

export function InsightsIncomeSpendingChart({
  labels,
  overview,
}: {
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
}) {
  const isMobile = useIsMobile();
  const data = incomeSpendingChartData(overview.incomeVsSpending, overview.currency, overview.locale);
  const hasData = hasIncomeOrSpending(overview.incomeVsSpending);

  return (
    <section
      aria-labelledby="insights-income-spending-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="insights-income-spending-title">
          {labels["insights.incomeVsSpending.title"]}
        </h2>
        {hasData ? (
          <ul className="flex items-center gap-4 text-[12px] text-[#667085]">
            <li className="flex items-center gap-1.5">
              <i aria-hidden="true" className="size-2 rounded-xs" style={{ background: INCOME_COLOR }} />
              {labels["insights.incomeVsSpending.income"]}
            </li>
            <li className="flex items-center gap-1.5">
              <i aria-hidden="true" className="size-2 rounded-xs" style={{ background: SPENDING_COLOR }} />
              {labels["insights.incomeVsSpending.spending"]}
            </li>
          </ul>
        ) : null}
      </div>
      {hasData ? (
        <>
          <div aria-hidden="true" className="mt-4 h-55 min-w-0">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                barCategoryGap={isMobile ? "22%" : "28%"}
                barGap={3}
                data={data}
                margin={{ top: 4, right: 4, bottom: 0, left: isMobile ? -18 : -6 }}
              >
                <CartesianGrid stroke="#edf1f6" strokeDasharray="2 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  interval={isMobile && data.length > 6 ? 1 : 0}
                  tick={{ fill: "#7b879e", fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: "#7b879e", fontSize: 11 }}
                  tickFormatter={(value: number) => formatCompactOverviewAmount(value, overview.locale)}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={({ active, payload }) => (
                    <IncomeSpendingTooltip
                      active={active}
                      currency={overview.currency}
                      datum={payload?.[0]?.payload as IncomeSpendingChartDatum | undefined}
                      labels={labels}
                      locale={overview.locale}
                    />
                  )}
                  cursor={{ fill: "#f3f6fb" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar dataKey="income" fill={INCOME_COLOR} isAnimationActive={false} maxBarSize={18} radius={[3, 3, 0, 0]} />
                <Bar dataKey="spending" fill={SPENDING_COLOR} isAnimationActive={false} maxBarSize={18} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{labels["insights.incomeVsSpending.title"]}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{labels["insights.incomeVsSpending.income"]}</th>
                <th scope="col">{labels["insights.incomeVsSpending.spending"]}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((datum) => (
                <tr key={datum.month}>
                  <th scope="row">{formatInsightsMonth(datum.month, overview.locale, "long")}</th>
                  <td>{formatInsightsMoney(datum.incomeMinor, overview.currency, overview.locale)}</td>
                  <td>{formatInsightsMoney(datum.spendingMinor, overview.currency, overview.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="grid h-55 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.incomeVsSpending.empty"]}
        </p>
      )}
    </section>
  );
}

function IncomeSpendingTooltip({
  active,
  currency,
  datum,
  labels,
  locale,
}: {
  readonly active?: boolean;
  readonly currency: string;
  readonly datum?: IncomeSpendingChartDatum;
  readonly labels: DashboardLabels;
  readonly locale: string;
}) {
  if (!active || !datum) return null;
  return (
    <div className="min-w-44 rounded-[10px] border border-[#e1e8f2] bg-white px-3 py-2.5 text-[12px] shadow-[0_10px_24px_rgb(20_44_84/12%)]">
      <p className="font-semibold text-[#1c2740]">
        {formatInsightsMonth(datum.month, locale, "long")}
        {datum.isPartial ? (
          <span className="ml-1.5 font-medium text-[#71809a]">· {labels["insights.incomeVsSpending.inProgress"]}</span>
        ) : null}
      </p>
      <dl className="mt-1.5 space-y-1">
        <div className="flex justify-between gap-4">
          <dt className="text-[#667085]">{labels["insights.incomeVsSpending.income"]}</dt>
          <dd className="font-medium text-[#1c2740] tabular-nums">{formatInsightsMoney(datum.incomeMinor, currency, locale)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#667085]">{labels["insights.incomeVsSpending.spending"]}</dt>
          <dd className="font-medium text-[#1c2740] tabular-nums">{formatInsightsMoney(datum.spendingMinor, currency, locale)}</dd>
        </div>
      </dl>
    </div>
  );
}
