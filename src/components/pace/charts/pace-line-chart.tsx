"use client";

import { LineChart, type LineSeriesOption } from "echarts/charts";
import { GridComponent, type GridComponentOption } from "echarts/components";
import {
  init,
  use as registerChartModules,
  type ComposeOption,
  type EChartsType,
} from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { PaceChartSkeleton } from "@/components/pace/charts/pace-chart-skeleton";
import { cn } from "@/lib/utils";

registerChartModules([LineChart, GridComponent, SVGRenderer]);

type PaceChartOption = ComposeOption<LineSeriesOption | GridComponentOption>;

export type PaceChartSeries<TDatum> = {
  readonly key: string;
  readonly label: string;
  readonly value: (datum: TDatum, index: number) => number | null;
  readonly color?: string;
  readonly area?: boolean;
  readonly dashed?: boolean;
  readonly showPoint?: (datum: TDatum, index: number) => boolean;
};

export type PaceChartBand<TDatum> = {
  readonly label: string;
  readonly lower: (datum: TDatum, index: number) => number;
  readonly upper: (datum: TDatum, index: number) => number;
  readonly color?: string;
};

export type PaceLineChartProps<TDatum> = {
  readonly data: readonly TDatum[];
  readonly series: readonly PaceChartSeries<TDatum>[];
  readonly band?: PaceChartBand<TDatum>;
  readonly xLabel: (datum: TDatum, index: number) => string;
  readonly showXTick?: (index: number) => boolean;
  readonly yTickFormatter?: (value: number) => string;
  readonly valueFormatter?: (value: number) => string;
  readonly includeZero?: boolean;
  readonly smooth?: boolean;
  readonly ariaLabel: string;
  readonly renderTooltip?: (datum: TDatum, index: number) => ReactNode;
  readonly selectedIndex?: number | null;
  readonly onPointSelect?: (index: number) => void;
  readonly legend?: boolean;
  readonly loading?: boolean;
  readonly emptyState?: ReactNode;
  readonly className?: string;
  readonly plotClassName?: string;
};

export const PACE_CHART_COLORS = {
  primary: "#1769e8",
  band: "#d6e5fb",
  grid: "#e9eef5",
  axis: "#dfe6ef",
  tick: "#71809a",
  surface: "#ffffff",
} as const;

const GRID = { top: 14, right: 14, bottom: 30, left: 48 } as const;

export function PaceLineChart<TDatum>({
  band,
  className,
  data,
  emptyState,
  legend,
  loading = false,
  plotClassName = "h-72",
  series,
  ...plotProps
}: PaceLineChartProps<TDatum>) {
  const showLegend = legend ?? series.length + (band ? 1 : 0) > 1;

  if (loading)
    return (
      <PaceChartSkeleton
        className={className}
        legend={showLegend}
        plotClassName={plotClassName}
      />
    );

  return (
    <div className={cn("min-w-0", className)}>
      {data.length ? (
        <ChartPlot
          band={band}
          data={data}
          plotClassName={plotClassName}
          series={series}
          {...plotProps}
        />
      ) : (
        <div
          className={cn(
            "grid place-items-center rounded-[10px] border border-dashed border-[#dfe6ef] bg-[#fbfcfe] px-4 text-center text-[13px] text-[#71809a]",
            plotClassName,
          )}
        >
          {emptyState}
        </div>
      )}
      {showLegend ? <ChartLegend band={band} series={series} /> : null}
    </div>
  );
}

function ChartPlot<TDatum>({
  ariaLabel,
  band,
  data,
  includeZero = true,
  onPointSelect,
  plotClassName,
  renderTooltip,
  selectedIndex,
  series,
  showXTick,
  smooth = false,
  valueFormatter = String,
  xLabel,
  yTickFormatter,
}: Omit<
  PaceLineChartProps<TDatum>,
  "legend" | "loading" | "emptyState" | "className"
>) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const count = data.length;
  const pinned =
    selectedIndex != null && selectedIndex >= 0 && selectedIndex < count
      ? selectedIndex
      : null;
  const activeIndex =
    hoverIndex != null && hoverIndex < count ? hoverIndex : pinned;
  const plotWidth = Math.max(0, size.width - GRID.left - GRID.right);
  const xForIndex = (index: number) =>
    GRID.left + (count > 1 ? (index / (count - 1)) * plotWidth : plotWidth / 2);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const chart = init(element, undefined, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(([entry]) => {
      chart.resize();
      if (entry)
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  const option = useMemo<PaceChartOption>(() => {
    const labels = data.map(xLabel);
    const bandColor = band?.color ?? PACE_CHART_COLORS.band;
    const bandSeries: LineSeriesOption[] = band
      ? [
          {
            id: "band-lower",
            type: "line",
            data: data.map((datum, index) => band.lower(datum, index)),
            stack: "band",
            stackStrategy: "all",
            lineStyle: { opacity: 0 },
            symbol: "none",
            silent: true,
            smooth,
          },
          {
            id: "band-range",
            type: "line",
            data: data.map(
              (datum, index) =>
                band.upper(datum, index) - band.lower(datum, index),
            ),
            stack: "band",
            stackStrategy: "all",
            lineStyle: { opacity: 0 },
            areaStyle: { color: bandColor, opacity: 0.85 },
            symbol: "none",
            silent: true,
            smooth,
          },
        ]
      : [];
    const lineSeries: LineSeriesOption[] = series.map((item) => {
      const color = item.color ?? PACE_CHART_COLORS.primary;
      return {
        id: item.key,
        type: "line",
        name: item.label,
        smooth,
        showAllSymbol: true,
        silent: true,
        z: 3,
        lineStyle: {
          color,
          width: 2,
          type: item.dashed ? [5, 4] : "solid",
        },
        areaStyle: item.area
          ? {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}2e` },
                  { offset: 1, color: `${color}00` },
                ],
              },
            }
          : undefined,
        data: data.map((datum, index) => {
          const isActive = index === activeIndex;
          const isResting = item.showPoint?.(datum, index) ?? false;
          return {
            value: item.value(datum, index) ?? "-",
            symbol: isActive || isResting ? "circle" : "none",
            symbolSize: isActive ? 11 : 7,
            itemStyle: {
              color,
              borderColor: PACE_CHART_COLORS.surface,
              borderWidth: isActive ? 2.5 : 1.5,
            },
          };
        }),
      };
    });

    return {
      animationDuration: reducedMotion ? 0 : 450,
      animationDurationUpdate: 0,
      grid: { ...GRID },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: PACE_CHART_COLORS.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: PACE_CHART_COLORS.tick,
          fontSize: 11,
          margin: 12,
          interval: showXTick ? (index: number) => showXTick(index) : "auto",
          alignMinLabel: "left",
          alignMaxLabel: "right",
          hideOverlap: true,
        },
      },
      yAxis: {
        type: "value",
        scale: !includeZero,
        splitNumber: 4,
        axisLabel: {
          color: PACE_CHART_COLORS.tick,
          fontSize: 11,
          formatter: yTickFormatter
            ? (value: number) => yTickFormatter(value)
            : undefined,
        },
        splitLine: { lineStyle: { color: PACE_CHART_COLORS.grid } },
      },
      series: [...bandSeries, ...lineSeries],
    };
  }, [
    activeIndex,
    band,
    data,
    includeZero,
    reducedMotion,
    series,
    showXTick,
    smooth,
    xLabel,
    yTickFormatter,
  ]);

  useEffect(() => {
    chartRef.current?.setOption(option, { replaceMerge: ["series"] });
  }, [option]);

  const indexFromPointer = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = plotWidth
      ? (event.clientX - rect.left - GRID.left) / plotWidth
      : 0;
    return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = activeIndex ?? 0;
    const step = event.shiftKey ? 7 : 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(count - 1, current + step)
        : event.key === "ArrowLeft"
          ? Math.max(0, current - step)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next != null) {
      event.preventDefault();
      setKeyboardActive(true);
      setHoverIndex(next);
    } else if (
      (event.key === "Enter" || event.key === " ") &&
      activeIndex != null
    ) {
      event.preventDefault();
      onPointSelect?.(activeIndex);
    } else if (event.key === "Escape") {
      setHoverIndex(null);
    }
  };

  const activeDatum = activeIndex != null ? data[activeIndex] : undefined;
  const crosshairX = activeIndex != null ? xForIndex(activeIndex) : 0;
  const tooltipOnLeft = crosshairX > size.width * 0.62;
  const primary = series[0];
  const activeValue =
    activeDatum !== undefined && primary
      ? primary.value(activeDatum, activeIndex!)
      : null;

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "relative w-full touch-pan-y select-none rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#1769e8] focus-visible:ring-offset-2",
        plotClassName,
      )}
      onBlur={() => {
        setKeyboardActive(false);
        setHoverIndex(null);
      }}
      onClick={(event) => {
        const index = indexFromPointer(event);
        onPointSelect?.(index);
      }}
      onKeyDown={onKeyDown}
      onPointerLeave={() => setHoverIndex(null)}
      onPointerMove={(event) => setHoverIndex(indexFromPointer(event))}
      role="group"
      tabIndex={0}
    >
      <div aria-hidden className="absolute inset-0" ref={surfaceRef} />
      {activeDatum !== undefined && size.width ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span
            className="absolute w-0 border-l border-dashed border-[#7fa7e6]"
            style={{
              left: crosshairX,
              top: GRID.top,
              height: Math.max(0, size.height - GRID.top - GRID.bottom),
            }}
          />
          {renderTooltip ? (
            <div
              className="absolute z-10 w-max max-w-56 rounded-[10px] border border-[#e1e8f2] bg-white px-3 py-2.5 shadow-[0_10px_24px_rgb(20_44_84/12%)]"
              style={{
                left: crosshairX,
                top: GRID.top + 2,
                transform: tooltipOnLeft
                  ? "translateX(calc(-100% - 12px))"
                  : "translateX(12px)",
              }}
            >
              {renderTooltip(activeDatum, activeIndex!)}
            </div>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {keyboardActive && activeDatum !== undefined
          ? `${xLabel(activeDatum, activeIndex!)}: ${activeValue == null ? "—" : valueFormatter(activeValue)}`
          : ""}
      </p>
      <div className="sr-only">
        <table>
          <caption>{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col" />
              {series.map((item) => (
                <th key={item.key} scope="col">
                  {item.label}
                </th>
              ))}
              {band ? <th scope="col">{band.label}</th> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((datum, index) => (
              <tr key={index}>
                <th scope="row">{xLabel(datum, index)}</th>
                {series.map((item) => {
                  const value = item.value(datum, index);
                  return (
                    <td key={item.key}>
                      {value == null ? "—" : valueFormatter(value)}
                    </td>
                  );
                })}
                {band ? (
                  <td>
                    {valueFormatter(band.lower(datum, index))} –{" "}
                    {valueFormatter(band.upper(datum, index))}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartLegend<TDatum>({
  band,
  series,
}: {
  band?: PaceChartBand<TDatum>;
  series: readonly PaceChartSeries<TDatum>[];
}) {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[#53627b]">
      {series.map((item) => (
        <li className="inline-flex items-center gap-2" key={item.key}>
          <span
            aria-hidden
            className={cn("h-0 w-4 border-t-2", item.dashed && "border-dashed")}
            style={{ borderColor: item.color ?? PACE_CHART_COLORS.primary }}
          />
          {item.label}
        </li>
      ))}
      {band ? (
        <li className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-[3px]"
            style={{ backgroundColor: band.color ?? PACE_CHART_COLORS.band }}
          />
          {band.label}
        </li>
      ) : null}
    </ul>
  );
}

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
