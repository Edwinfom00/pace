"use client";

import { useCallback, useMemo } from "react";
import { FiArrowDown, FiArrowUp } from "react-icons/fi";

import {
  PaceLineChart,
  type PaceChartBand,
  type PaceChartSeries,
} from "@/components/pace/charts/pace-line-chart";
import type {
  CurrencyForecast,
  ForecastHorizonDays,
  ForecastPoint,
} from "@/modules/forecast/domain/forecast";
import {
  cumulativeForecastFlows,
  forecastAxisTickIndexes,
} from "@/modules/forecast/domain/forecast-presentation";
import {
  formatForecastLongDate,
  formatSignedMoney,
  type ForecastLabels,
} from "@/modules/forecast/ui/forecast-format";
import {
  formatCompactOverviewAmount,
  formatOverviewDate,
  formatOverviewMoney,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

export function ForecastBalanceChart({
  currency,
  horizonDays,
  labels,
  locale,
  onSelect,
  plotClassName,
  selected,
}: {
  currency: CurrencyForecast;
  horizonDays: ForecastHorizonDays;
  labels: ForecastLabels;
  locale: string;
  onSelect: (index: number) => void;
  plotClassName?: string;
  selected: number | null;
}) {
  const code = currency.currency;
  const flows = useMemo(() => cumulativeForecastFlows(currency), [currency]);
  const ticks = useMemo(
    () =>
      forecastAxisTickIndexes(
        currency.points.map((point) => point.date),
        horizonDays,
      ),
    [currency, horizonDays],
  );
  const series = useMemo<PaceChartSeries<ForecastPoint>[]>(
    () => [
      {
        key: "projected",
        label: labels.legendProjected,
        value: (point) =>
          minorToChartValue(point.projectedClosingBalance.nominalMinor, code),
        showPoint: (point) => point.events.length > 0,
      },
    ],
    [code, labels.legendProjected],
  );
  const band = useMemo<PaceChartBand<ForecastPoint>>(
    () => ({
      label: labels.legendRange,
      lower: (point) =>
        minorToChartValue(point.projectedClosingBalance.minimumMinor, code),
      upper: (point) =>
        minorToChartValue(point.projectedClosingBalance.maximumMinor, code),
    }),
    [code, labels.legendRange],
  );
  const xLabel = useCallback(
    (point: ForecastPoint) => formatOverviewDate(point.date, locale),
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
        currency: code,
        currencyDisplay: "code",
      }).format(value),
    [code, locale],
  );

  return (
    <PaceLineChart
      ariaLabel={labels.chartDescription}
      band={band}
      data={currency.points}
      onPointSelect={onSelect}
      plotClassName={plotClassName}
      renderTooltip={(point, index) => (
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-[#53627b]">
            {formatForecastLongDate(point.date, locale)}
          </p>
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#101a35]">
            {formatOverviewMoney(point.projectedClosingBalance.nominalMinor, code, locale)}
          </p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-[#14945a]">
            <FiArrowUp aria-hidden className="size-3" />
            {formatSignedMoney(flows[index]!.inflowMinor, code, locale, "+")}
            <span className="font-normal text-[#71809a]">{labels.tooltipInflow}</span>
          </p>
          <p className="flex items-center gap-1 text-[11px] font-medium text-[#e14958]">
            <FiArrowDown aria-hidden className="size-3" />
            {formatSignedMoney(flows[index]!.outflowMinor, code, locale, "-")}
            <span className="font-normal text-[#71809a]">{labels.tooltipOutflow}</span>
          </p>
        </div>
      )}
      selectedIndex={selected}
      series={series}
      showXTick={showXTick}
      valueFormatter={valueFormatter}
      xLabel={xLabel}
      yTickFormatter={yTickFormatter}
    />
  );
}
