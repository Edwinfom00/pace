"use client";

import { useCallback, useMemo } from "react";

import {
  PaceLineChart,
  type PaceChartSeries,
} from "@/components/pace/charts/pace-line-chart";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatCompactOverviewAmount,
  formatOverviewDate,
} from "@/modules/overview/domain/overview-formatters";

import type { AccountAnalysis } from "../../account/account-analysis.types";
import {
  balanceChartData,
  type BalanceChartDatum,
} from "../account-analysis-format";
import { formatInsightsMoney, visibleTrendTickIndexes } from "../insights-format";

export function AccountBalanceChart({
  analysis,
  labels,
}: {
  readonly analysis: Pick<
    AccountAnalysis,
    "balanceTrend" | "balances" | "currency" | "locale"
  >;
  readonly labels: DashboardLabels;
}) {
  const isMobile = useIsMobile();
  const { balances, currency, locale } = analysis;
  const data = useMemo(
    () => balanceChartData(analysis.balanceTrend.points, currency),
    [analysis.balanceTrend.points, currency],
  );
  const ticks = useMemo(
    () => visibleTrendTickIndexes(data.length, isMobile),
    [data.length, isMobile],
  );
  const series = useMemo<PaceChartSeries<BalanceChartDatum>[]>(
    () => [
      {
        key: "balance",
        label: labels["insights.account.balance.series"],
        value: (datum) => datum.balance,
        area: true,
      },
    ],
    [labels],
  );
  const xLabel = useCallback(
    (datum: BalanceChartDatum) => formatOverviewDate(datum.date, locale),
    [locale],
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
  const money = (minor: string) => formatInsightsMoney(minor, currency, locale);

  return (
    <section
      aria-labelledby="account-balance-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
            id="account-balance-title">
            {labels["insights.account.balance.title"]}
          </h2>
          <p className="text-[12px] leading-5 text-[#71809a]">
            {labels["insights.account.balance.description"]}
          </p>
        </div>
        <dl className="flex gap-5 text-[12px] leading-5">
          <div>
            <dt className="text-[#71809a]">{labels["insights.account.balance.opening"]}</dt>
            <dd className="font-semibold text-[#1c2740] tabular-nums">{money(balances.periodOpeningMinor)}</dd>
          </div>
          <div>
            <dt className="text-[#71809a]">{labels["insights.account.balance.closing"]}</dt>
            <dd className="font-semibold text-[#1c2740] tabular-nums">{money(balances.periodClosingMinor)}</dd>
          </div>
        </dl>
      </div>
      {analysis.balanceTrend.hasMovement ? (
        <PaceLineChart
          ariaLabel={labels["insights.account.balance.title"]}
          className="mt-4"
          data={data}
          includeZero={false}
          legend={false}
          plotClassName="h-[210px] sm:h-[230px]"
          renderTooltip={(datum) =>
            datum.balanceMinor === null ? null : (
              <dl className="text-[12px]">
                <dt className="text-[#667085]">{formatOverviewDate(datum.date, locale)}</dt>
                <dd className="font-semibold text-[#1c2740] tabular-nums">{money(datum.balanceMinor)}</dd>
              </dl>
            )
          }
          series={series}
          showXTick={showXTick}
          valueFormatter={valueFormatter}
          xLabel={xLabel}
          yTickFormatter={yTickFormatter}
        />
      ) : (
        <p className="grid h-52.5 place-items-center px-4 text-center text-[14px] text-[#667085]">
          {labels["insights.account.balance.empty"]}
        </p>
      )}
    </section>
  );
}
