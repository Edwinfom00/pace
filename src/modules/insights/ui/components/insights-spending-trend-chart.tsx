"use client";

import { useCallback, useMemo } from "react";

import {
  PaceLineChart,
  type PaceChartSeries,
} from "@/components/pace/charts/pace-line-chart";
import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatCompactOverviewAmount,
  formatOverviewDate,
} from "@/modules/overview/domain/overview-formatters";

import type { InsightsOverview } from "../../overview/insights-overview.types";
import {
  formatComparisonPeriod,
  formatInsightsMoney,
  trendChartData,
  visibleTrendTickIndexes,
  type TrendChartDatum,
} from "../insights-format";

export function InsightsSpendingTrendChart({
  labels,
  overview,
}: {
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
}) {
  const isMobile = useIsMobile();
  const { currency, locale } = overview;
  const data = useMemo(
    () => trendChartData(overview.spendingTrend.points, currency),
    [overview.spendingTrend.points, currency],
  );
  const ticks = useMemo(
    () => visibleTrendTickIndexes(data.length, isMobile),
    [data.length, isMobile],
  );
  const series = useMemo<PaceChartSeries<TrendChartDatum>[]>(
    () => [
      {
        key: "current",
        label: labels["insights.trend.current"],
        value: (datum) => datum.current,
        area: true,
      },
      {
        key: "previous",
        label: labels["insights.trend.previous"],
        value: (datum) => datum.previous,
        color: "#8da8dc",
        dashed: true,
      },
    ],
    [labels],
  );
  const xLabel = useCallback(
    (datum: TrendChartDatum) => {
      const date = datum.currentDate ?? datum.previousDate;
      return datum.currentDate && date
        ? formatOverviewDate(date, locale)
        : formatDashboardLabel(labels, "insights.trend.day", {
            day: datum.day,
          });
    },
    [labels, locale],
  );
  const showXTick = useCallback((index: number) => ticks.has(index), [ticks]);
  const yTickFormatter = useCallback(
    (value: number) => formatCompactOverviewAmount(value, locale),
    [locale],
  );
  const valueFormatter = useCallback(
    (value: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value),
    [currency, locale],
  );

  return (
    <section
      aria-labelledby="insights-trend-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-0.5">
        <h2
          className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
          id="insights-trend-title">
          {labels["insights.trend.title"]}
        </h2>
        <p className="text-[12px] leading-5 text-[#71809a]">
          {labels["insights.trend.cumulative"]} ·{" "}
          {formatComparisonPeriod(overview.previous, labels, locale)}
        </p>
      </div>
      {overview.spendingTrend.hasSpending ? (
        <PaceLineChart
          ariaLabel={labels["insights.trend.title"]}
          className="mt-4"
          data={data}
          plotClassName="h-[230px] sm:h-[250px]"
          renderTooltip={(datum) => (
            <TrendTooltip
              currency={currency}
              datum={datum}
              labels={labels}
              locale={locale}
            />
          )}
          series={series}
          showXTick={showXTick}
          valueFormatter={valueFormatter}
          xLabel={xLabel}
          yTickFormatter={yTickFormatter}
        />
      ) : (
        <p className="grid h-57.5 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.trend.empty"]}
        </p>
      )}
    </section>
  );
}

function TrendTooltip({
  currency,
  datum,
  labels,
  locale,
}: {
  readonly currency: string;
  readonly datum: TrendChartDatum;
  readonly labels: DashboardLabels;
  readonly locale: string;
}) {
  const rows = [
    {
      key: "current",
      label: labels["insights.trend.current"],
      date: datum.currentDate,
      minor: datum.currentMinor,
    },
    {
      key: "previous",
      label: labels["insights.trend.previous"],
      date: datum.previousDate,
      minor: datum.previousMinor,
    },
  ].filter((row) => row.minor !== null);
  return (
    <dl className="space-y-1.5 text-[12px]">
      {rows.map((row) => (
        <div key={row.key}>
          <dt className="text-[#667085]">
            {row.label}
            {row.date ? ` · ${formatOverviewDate(row.date, locale)}` : ""}
          </dt>
          <dd className="font-semibold text-[#1c2740] tabular-nums">
            {formatInsightsMoney(row.minor!, currency, locale)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
