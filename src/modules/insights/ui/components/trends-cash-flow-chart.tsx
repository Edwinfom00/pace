"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCompactOverviewAmount } from "@/modules/overview/domain/overview-formatters";

import type { InsightsTrends } from "../../trends/insights-trends.types";
import { formatInsightsMoney, formatInsightsMonth } from "../insights-format";
import {
  cashFlowChartData,
  cashFlowSummary,
  hasCashFlow,
  type CashFlowChartDatum,
} from "../trends-format";

const INCOME_COLOR = "#8fb4ef";
const SPENDING_COLOR = "#1769e8";
const NET_COLOR = "#101a35";

export function TrendsCashFlowChart({
  labels,
  trends,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
}) {
  const isMobile = useIsMobile();
  const data = cashFlowChartData(trends.months, trends.currency, trends.locale);
  const hasData = hasCashFlow(trends.months);
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);
  const series = [
    {
      key: "income",
      color: INCOME_COLOR,
      label: labels["insights.trends.cashFlow.income"],
    },
    {
      key: "spending",
      color: SPENDING_COLOR,
      label: labels["insights.trends.cashFlow.spending"],
    },
    {
      key: "net",
      color: NET_COLOR,
      label: labels["insights.trends.cashFlow.net"],
    },
  ] as const;

  return (
    <section
      aria-labelledby="trends-cash-flow-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2
          className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
          id="trends-cash-flow-title">
          {labels["insights.trends.cashFlow.title"]}
        </h2>
        {hasData ? (
          <ul className="flex items-center gap-4 text-[12px] text-[#667085]">
            {series.map((item) => (
              <li className="flex items-center gap-1.5" key={item.key}>
                <i
                  aria-hidden="true"
                  className={
                    item.key === "net"
                      ? "h-0.5 w-3 rounded-full"
                      : "size-2 rounded-xs"
                  }
                  style={{ background: item.color }}
                />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {hasData ? (
        <>
          <p className="sr-only">{cashFlowSummary(trends, labels)}</p>
          <div aria-hidden="true" className="mt-4 h-60 min-w-0 sm:h-66">
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                barCategoryGap={isMobile ? "20%" : "28%"}
                barGap={3}
                data={data}
                margin={{
                  top: 6,
                  right: 4,
                  bottom: 0,
                  left: isMobile ? -18 : -6,
                }}>
                <CartesianGrid
                  stroke="#edf1f6"
                  strokeDasharray="2 3"
                  vertical={false}
                />
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
                  tickFormatter={(value: number) =>
                    formatCompactOverviewAmount(value, trends.locale)
                  }
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine stroke="#d6dde8" y={0} />
                <Tooltip
                  content={({ active, payload }) => (
                    <CashFlowTooltip
                      active={active}
                      datum={
                        payload?.[0]?.payload as CashFlowChartDatum | undefined
                      }
                      labels={labels}
                      locale={trends.locale}
                      money={money}
                    />
                  )}
                  cursor={{ fill: "#f3f6fb" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="income"
                  fill={INCOME_COLOR}
                  isAnimationActive={false}
                  maxBarSize={18}
                  radius={[3, 3, 0, 0]}>
                  {data.map((datum) => (
                    <Cell
                      fillOpacity={datum.isPartial ? 0.55 : 1}
                      key={datum.month}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="spending"
                  fill={SPENDING_COLOR}
                  isAnimationActive={false}
                  maxBarSize={18}
                  radius={[3, 3, 0, 0]}>
                  {data.map((datum) => (
                    <Cell
                      fillOpacity={datum.isPartial ? 0.55 : 1}
                      key={datum.month}
                    />
                  ))}
                </Bar>
                <Line
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  dataKey="net"
                  dot={{ r: 2.5, strokeWidth: 0, fill: NET_COLOR }}
                  isAnimationActive={false}
                  stroke={NET_COLOR}
                  strokeWidth={1.75}
                  type="monotone"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{labels["insights.trends.cashFlow.title"]}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">{labels["insights.trends.cashFlow.income"]}</th>
                <th scope="col">
                  {labels["insights.trends.cashFlow.spending"]}
                </th>
                <th scope="col">{labels["insights.trends.cashFlow.net"]}</th>
                <th scope="col">
                  {labels["insights.trends.cashFlow.transactions"]}
                </th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((datum) => !datum.isFuture)
                .map((datum) => (
                  <tr key={datum.month}>
                    <th scope="row">
                      {formatInsightsMonth(datum.month, trends.locale, "long")}
                    </th>
                    <td>{money(datum.incomeMinor)}</td>
                    <td>{money(datum.spendingMinor)}</td>
                    <td>{money(datum.netMinor)}</td>
                    <td>{datum.transactionCount}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="grid h-60 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.trends.cashFlow.empty"]}
        </p>
      )}
    </section>
  );
}

function CashFlowTooltip({
  active,
  datum,
  labels,
  locale,
  money,
}: {
  readonly active?: boolean;
  readonly datum?: CashFlowChartDatum;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly money: (minor: string) => string;
}) {
  if (!active || !datum || datum.isFuture) return null;
  const rows = [
    [labels["insights.trends.cashFlow.income"], money(datum.incomeMinor)],
    [labels["insights.trends.cashFlow.spending"], money(datum.spendingMinor)],
    [labels["insights.trends.cashFlow.net"], money(datum.netMinor)],
    [
      labels["insights.trends.cashFlow.transactions"],
      String(datum.transactionCount),
    ],
  ] as const;
  return (
    <div className="min-w-44 rounded-[10px] border border-[#e1e8f2] bg-white px-3 py-2.5 text-[12px] shadow-[0_10px_24px_rgb(20_44_84/12%)]">
      <p className="font-semibold text-[#1c2740]">
        {formatInsightsMonth(datum.month, locale, "long")}
        {datum.isPartial ? (
          <span className="ml-1.5 font-medium text-[#71809a]">
            · {labels["insights.trends.cashFlow.inProgress"]}
          </span>
        ) : null}
      </p>
      <dl className="mt-1.5 space-y-1">
        {rows.map(([label, value]) => (
          <div className="flex justify-between gap-4" key={label}>
            <dt className="text-[#667085]">{label}</dt>
            <dd className="font-medium text-[#1c2740] tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
