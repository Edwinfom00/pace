"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";

import {
  formatCompactOverviewAmount,
  formatOverviewDate,
  minorToChartValue,
} from "../../domain/overview-formatters";
import type { OverviewFinancialSummary, OverviewSpendingPacePoint } from "../../domain/overview.types";
import { SpendingPaceTooltip } from "./spending-pace-tooltip";

type ChartPoint = OverviewSpendingPacePoint & { actual: number | null; typical: number };

export function visibleOverviewChartDays(dayCount: number, mobile: boolean): number[] {
  const candidates = mobile ? [1, 10, 20, dayCount] : [1, 5, 10, 15, 20, 25, dayCount];
  return [...new Set(candidates.filter((day) => day >= 1 && day <= dayCount))];
}

export function SpendingPaceChart({
  summary,
  labels,
}: {
  summary: OverviewFinancialSummary;
  labels: DashboardLabels;
}) {
  const isMobile = useIsMobile();
  const pace = summary.spendingPace;
  const chartData: ChartPoint[] = pace.points.map((point) => ({
    ...point,
    actual: point.actualMinor === null ? null : minorToChartValue(point.actualMinor, summary.currency),
    typical: minorToChartValue(point.typicalMinor, summary.currency),
  }));
  const visibleDays = visibleOverviewChartDays(chartData.length, isMobile);
  const currentMarker = pace.currentDay ? chartData.find((point) => point.day === pace.currentDay)?.date : undefined;

  return (
    <section aria-labelledby="spending-pace-title" className="rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]" id="spending-pace-title">
          {labels["overview.spendingPace.title"]}
        </h2>
        {pace.availability === "value" && pace.hasActualSpending ? (
          <div aria-label={labels["overview.spendingPace.legend"]} className="flex items-center gap-4 text-[12px] text-[#667085]">
            <span className="flex items-center gap-1.5"><i aria-hidden="true" className="size-2 rounded-full bg-[#2f75e8]" />{labels["overview.spendingPace.actual"]}</span>
            <span className="flex items-center gap-1.5"><i aria-hidden="true" className="block w-4 border-t-2 border-dashed border-[#8da8dc]" />{labels["overview.spendingPace.typical"]}</span>
          </div>
        ) : null}
      </div>
      {pace.availability === "not-applicable" ? (
        <div className="flex h-[236px] items-center justify-center text-center text-[14px] text-[#667085]">
          {labels["overview.spendingPace.notApplicable"]}
        </div>
      ) : !pace.hasActualSpending ? (
        <div className="flex h-[236px] items-center justify-center text-center text-[14px] text-[#667085]">
          {labels["overview.spendingPace.empty"]}
        </div>
      ) : (
        <>
          <p className="sr-only">
            {labels["overview.spendingPace.summary"]} {formatOverviewDate(chartData.at(-1)?.date ?? "", summary.locale)}.
          </p>
          <div className="mt-3 h-[210px] min-w-0 sm:h-[226px]">
            <ResponsiveContainer height="100%" width="100%">
              <LineChart data={chartData} margin={{ top: 8, right: isMobile ? 2 : 8, bottom: 0, left: isMobile ? -12 : -4 }}>
                <CartesianGrid stroke="#edf1f6" strokeDasharray="2 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  interval="preserveStartEnd"
                  tick={{ fill: "#7b879e", fontSize: 12 }}
                  tickFormatter={(date) => {
                    const point = chartData.find((candidate) => candidate.date === date);
                    if (!point || !visibleDays.includes(point.day)) return "";
                    return point.day === 1 ? formatOverviewDate(date, summary.locale) : String(point.day);
                  }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  hide={isMobile}
                  tick={{ fill: "#7b879e", fontSize: 12 }}
                  tickFormatter={(value: number) => formatCompactOverviewAmount(value, summary.locale)}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  allowEscapeViewBox={{ x: false, y: false }}
                  content={({ active, payload }) => (
                    <SpendingPaceTooltip
                      active={active}
                      currency={summary.currency}
                      labels={labels}
                      locale={summary.locale}
                      point={payload?.[0]?.payload as OverviewSpendingPacePoint | undefined}
                    />
                  )}
                  cursor={{ stroke: "#9ab6e9", strokeDasharray: "3 3", strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none" }}
                />
                {currentMarker ? <ReferenceLine stroke="#9ab6e9" strokeDasharray="3 3" strokeWidth={1} x={currentMarker} /> : null}
                <Line
                  connectNulls={false}
                  dataKey="typical"
                  dot={false}
                  isAnimationActive={false}
                  name={labels["overview.spendingPace.typical"]}
                  stroke="#8da8dc"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  type="monotone"
                />
                <Line
                  activeDot={{ fill: "#2f75e8", r: 4, stroke: "white", strokeWidth: 2 }}
                  connectNulls={false}
                  dataKey="actual"
                  dot={false}
                  isAnimationActive={false}
                  name={labels["overview.spendingPace.actual"]}
                  stroke="#2874e8"
                  strokeWidth={2.25}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </section>
  );
}
