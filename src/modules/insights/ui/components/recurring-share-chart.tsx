"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatCompactOverviewAmount } from "@/modules/overview/domain/overview-formatters";

import type { InsightsRecurring } from "../../recurring/insights-recurring.types";
import {
  formatInsightsMoney,
  formatInsightsMonth,
  formatInsightsShare,
} from "../insights-format";
import {
  hasRecurringActuals,
  recurringShareChartData,
  recurringTrendSummary,
  type RecurringShareChartDatum,
} from "../recurring-format";

const RECURRING_COLOR = "#1769e8";
const OTHER_COLOR = "#dbe5f4";

export function RecurringShareChart({
  labels,
  recurring,
}: {
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
}) {
  const isMobile = useIsMobile();
  const data = recurringShareChartData(
    recurring.months,
    recurring.currency,
    recurring.locale,
  );
  const hasData = hasRecurringActuals(recurring.months);
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);
  const share = (bps: number) => formatInsightsShare(bps, recurring.locale);
  const series = [
    {
      key: "recurring",
      color: RECURRING_COLOR,
      label: labels["insights.recurring.trend.recurring"],
    },
    {
      key: "other",
      color: OTHER_COLOR,
      label: labels["insights.recurring.trend.other"],
    },
  ] as const;

  return (
    <section
      aria-labelledby="recurring-share-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2
            className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
            id="recurring-share-title">
            {labels["insights.recurring.trend.title"]}
            <span className="rounded-lg bg-[#eef4ff] px-1.5 text-[10px] leading-4.5 font-semibold tracking-wide text-[#1d5fd0] uppercase">
              {labels["insights.recurring.actual"]}
            </span>
          </h2>
          <p className="text-[12px] leading-5 text-[#71809a]">
            {labels["insights.recurring.trend.description"]}
          </p>
        </div>
        {hasData ? (
          <ul className="flex items-center gap-4 pt-1 text-[12px] text-[#667085]">
            {series.map((item) => (
              <li className="flex items-center gap-1.5" key={item.key}>
                <i
                  aria-hidden="true"
                  className="size-2 rounded-xs"
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
          <p className="sr-only">{recurringTrendSummary(recurring, labels)}</p>
          <div aria-hidden="true" className="mt-4 h-56 min-w-0 sm:h-62">
            <ResponsiveContainer height="100%" width="100%">
              <ComposedChart
                barCategoryGap={isMobile ? "22%" : "34%"}
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
                    formatCompactOverviewAmount(value, recurring.locale)
                  }
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={({ active, payload }) => (
                    <RecurringShareTooltip
                      active={active}
                      datum={
                        payload?.[0]?.payload as
                          | RecurringShareChartDatum
                          | undefined
                      }
                      labels={labels}
                      locale={recurring.locale}
                      money={money}
                      share={share}
                    />
                  )}
                  cursor={{ fill: "#f3f6fb" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar
                  dataKey="recurring"
                  fill={RECURRING_COLOR}
                  isAnimationActive={false}
                  maxBarSize={22}
                  stackId="spending">
                  {data.map((datum) => (
                    <Cell
                      fillOpacity={datum.isPartial ? 0.55 : 1}
                      key={datum.month}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="other"
                  fill={OTHER_COLOR}
                  isAnimationActive={false}
                  maxBarSize={22}
                  radius={[3, 3, 0, 0]}
                  stackId="spending">
                  {data.map((datum) => (
                    <Cell
                      fillOpacity={datum.isPartial ? 0.6 : 1}
                      key={datum.month}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{labels["insights.recurring.trend.title"]}</caption>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">
                  {labels["insights.recurring.trend.recurring"]}
                </th>
                <th scope="col">{labels["insights.recurring.trend.other"]}</th>
                <th scope="col">{labels["insights.recurring.trend.share"]}</th>
                <th scope="col">{labels["insights.recurring.trend.income"]}</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((datum) => !datum.isFuture)
                .map((datum) => (
                  <tr key={datum.month}>
                    <th scope="row">
                      {formatInsightsMonth(
                        datum.month,
                        recurring.locale,
                        "long",
                      )}
                    </th>
                    <td>{money(datum.recurringSpendingMinor)}</td>
                    <td>{money(datum.otherSpendingMinor)}</td>
                    <td>{share(datum.shareBps)}</td>
                    <td>{money(datum.recurringIncomeMinor)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="grid h-56 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.recurring.trend.empty"]}
        </p>
      )}
    </section>
  );
}

function RecurringShareTooltip({
  active,
  datum,
  labels,
  locale,
  money,
  share,
}: {
  readonly active?: boolean;
  readonly datum?: RecurringShareChartDatum;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly money: (minor: string) => string;
  readonly share: (bps: number) => string;
}) {
  if (!active || !datum || datum.isFuture) return null;
  const rows = [
    [
      labels["insights.recurring.trend.recurring"],
      money(datum.recurringSpendingMinor),
    ],
    [labels["insights.recurring.trend.other"], money(datum.otherSpendingMinor)],
    [labels["insights.recurring.trend.share"], share(datum.shareBps)],
    [
      labels["insights.recurring.trend.income"],
      money(datum.recurringIncomeMinor),
    ],
  ] as const;
  return (
    <div className="min-w-48 rounded-[10px] border border-[#e1e8f2] bg-white px-3 py-2.5 text-[12px] shadow-[0_10px_24px_rgb(20_44_84/12%)]">
      <p className="font-semibold text-[#1c2740]">
        {formatInsightsMonth(datum.month, locale, "long")}
        {datum.isPartial ? (
          <span className="ml-1.5 font-medium text-[#71809a]">
            · {labels["insights.recurring.trend.inProgress"]}
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
