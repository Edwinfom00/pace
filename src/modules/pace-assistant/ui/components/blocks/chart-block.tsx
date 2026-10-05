"use client";

import { useRef, useState } from "react";
import { FiDownload } from "react-icons/fi";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  formatCompactOverviewAmount,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

import { formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, BlockTitle } from "./block-primitives";

type ChartData = Extract<PaceAssistantBlock, { type: "chart" }>;
type LegendEntry = {
  readonly key: string;
  readonly label: string;
  readonly color: string;
};

const PALETTE = [
  "#1769e8",
  "#8fb4ef",
  "#20a36b",
  "#d58a2d",
  "#7c5cd6",
  "#53627c",
  "#c2410c",
  "#0e7490",
  "#a21caf",
  "#64748b",
  "#84cc16",
  "#e11d48",
];
const AXIS_TICK = { fill: "#7b879e", fontSize: 11 };
const EXPORT_SCALE = 2;
const EXPORT_PADDING = 20;
const EXPORT_FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export function ChartBlock({
  block,
  locale,
  downloadLabel,
}: {
  readonly block: ChartData;
  readonly locale: string;
  readonly downloadLabel: string;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const isDonut = block.chartType === "donut";
  const legend: LegendEntry[] = isDonut
    ? block.categories.map((label, index) => ({
        key: `${index}`,
        label,
        color: PALETTE[index % PALETTE.length]!,
      }))
    : block.series.map((series, index) => ({
        key: series.key,
        label: series.label,
        color: PALETTE[index % PALETTE.length]!,
      }));
  const money = (minorUnits: string) =>
    formatAssistantMoney({ minorUnits, currency: block.currency }, locale);
  const rows = block.categories.map((label, index) => ({
    label,
    ...Object.fromEntries(
      block.series.map((series) => [
        series.key,
        minorToChartValue(series.values[index] ?? "0", block.currency),
      ]),
    ),
  }));
  const slices = block.categories.map((label, index) => ({
    label,
    value: Math.max(
      0,
      minorToChartValue(block.series[0]?.values[index] ?? "0", block.currency),
    ),
  }));
  const tooltip = (
    <Tooltip
      content={({ active, payload }) => {
        const index = active
          ? block.categories.indexOf(
              String(
                (payload?.[0]?.payload as { label?: string } | undefined)
                  ?.label,
              ),
            )
          : -1;
        if (index < 0) return null;
        return (
          <div className="rounded-[8px] border border-[#e1e7f0] bg-white px-2.5 py-2 text-[11px] shadow-[0_6px_18px_rgb(15_23_42/10%)]">
            <p className="font-semibold text-[#263149]">
              {block.categories[index]}
            </p>
            {(isDonut ? block.series.slice(0, 1) : block.series).map(
              (series, seriesIndex) => (
                <p
                  className="mt-0.5 flex items-center gap-1.5 text-[#53627c]"
                  key={series.key}>
                  <i
                    aria-hidden
                    className="size-2 rounded-xs"
                    style={{
                      background: isDonut
                        ? legend[index]?.color
                        : legend[seriesIndex]?.color,
                    }}
                  />
                  {isDonut ? null : <span>{series.label}</span>}
                  <span className="font-medium tabular-nums text-[#17223b]">
                    {money(series.values[index] ?? "0")}
                  </span>
                </p>
              ),
            )}
          </div>
        );
      }}
      cursor={isDonut ? false : { fill: "#f3f6fb" }}
      wrapperStyle={{ outline: "none" }}
    />
  );
  const axes = (
    <>
      <CartesianGrid stroke="#edf1f6" strokeDasharray="2 3" vertical={false} />
      <XAxis
        axisLine={false}
        dataKey="label"
        interval="preserveStartEnd"
        tick={AXIS_TICK}
        tickLine={false}
      />
      <YAxis
        axisLine={false}
        tick={AXIS_TICK}
        tickFormatter={(value: number) =>
          formatCompactOverviewAmount(value, locale)
        }
        tickLine={false}
        width={44}
      />
    </>
  );

  async function download() {
    const svg = plot.current?.querySelector("svg");
    if (!svg || exporting) return;
    setExporting(true);
    try {
      await downloadChartPng(svg, {
        title: block.title,
        note: block.note ?? null,
        legend,
        fileName: `${chartFileName(block.title)}.png`,
      });
    } catch (cause) {
      console.error("[pace-assistant] Chart PNG export failed", cause);
    } finally {
      setExporting(false);
    }
  }

  return (
    <AssistantBlock>
      <div className="flex items-start justify-between gap-3 pr-2.5">
        <BlockTitle>{block.title}</BlockTitle>
        <button
          aria-busy={exporting || undefined}
          className="mt-2.5 inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] border border-[#dbe3ef] bg-white px-2 text-[11px] font-medium text-[#34405a] transition-colors hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1976ef] disabled:opacity-60"
          disabled={exporting}
          onClick={() => void download()}
          type="button">
          <FiDownload aria-hidden className="size-3" />
          {downloadLabel}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-3.5 text-[11px] text-[#667085]">
        {legend.map((entry, index) => (
          <li className="flex min-w-0 items-center gap-1.5" key={entry.key}>
            <i
              aria-hidden
              className="size-2 shrink-0 rounded-xs"
              style={{ background: entry.color }}
            />
            <span className="truncate">{entry.label}</span>
            {isDonut ? (
              <span className="tabular-nums text-[#34405a]">
                {money(block.series[0]?.values[index] ?? "0")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div aria-hidden className="mt-2 h-48 min-w-0 px-2" ref={plot}>
        <ResponsiveContainer height="100%" width="100%">
          {isDonut ? (
            <PieChart>
              {tooltip}
              <Pie
                cx="50%"
                cy="50%"
                data={slices}
                dataKey="value"
                innerRadius="55%"
                isAnimationActive={false}
                nameKey="label"
                outerRadius="90%"
                paddingAngle={1}
                stroke="#fff">
                {slices.map((slice, index) => (
                  <Cell fill={legend[index]?.color} key={slice.label} />
                ))}
              </Pie>
            </PieChart>
          ) : block.chartType === "line" ? (
            <LineChart
              data={rows}
              margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
              {axes}
              {tooltip}
              {block.series.map((series, index) => (
                <Line
                  dataKey={series.key}
                  dot={{ r: 2.5 }}
                  isAnimationActive={false}
                  key={series.key}
                  stroke={legend[index]?.color}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </LineChart>
          ) : (
            <BarChart
              barCategoryGap="24%"
              barGap={3}
              data={rows}
              margin={{ top: 6, right: 8, bottom: 0, left: -4 }}>
              {axes}
              {tooltip}
              {block.series.map((series, index) => (
                <Bar
                  dataKey={series.key}
                  fill={legend[index]?.color}
                  isAnimationActive={false}
                  key={series.key}
                  maxBarSize={18}
                  radius={[3, 3, 0, 0]}
                  stackId={
                    block.chartType === "stacked-bar" ? "stack" : undefined
                  }
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {block.note ? (
        <p className="px-3.5 pt-1 text-[11px] text-[#7b859a]">{block.note}</p>
      ) : null}
      <table className="sr-only">
        <caption>{block.title}</caption>
        <thead>
          <tr>
            <th scope="col" />
            {block.series.map((series) => (
              <th key={series.key} scope="col">
                {series.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.categories.map((category, index) => (
            <tr key={category}>
              <th scope="row">{category}</th>
              {block.series.map((series) => (
                <td key={series.key}>{money(series.values[index] ?? "0")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-3" />
    </AssistantBlock>
  );
}

export function chartFileName(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `pace-${slug || "chart"}`;
}

async function downloadChartPng(
  svg: SVGSVGElement,
  frame: {
    readonly title: string;
    readonly note: string | null;
    readonly legend: readonly LegendEntry[];
    readonly fileName: string;
  },
) {
  const { width, height } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", `${width}`);
  clone.setAttribute("height", `${height}`);
  clone.style.fontFamily = EXPORT_FONT;
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error("The chart could not be rasterized."));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await loaded;

  const headerHeight = 58;
  const footerHeight = frame.note ? 30 : 10;
  const canvas = document.createElement("canvas");
  canvas.width = (width + EXPORT_PADDING * 2) * EXPORT_SCALE;
  canvas.height =
    (height + headerHeight + footerHeight + EXPORT_PADDING) * EXPORT_SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "middle";
  context.fillStyle = "#18233d";
  context.font = `600 15px ${EXPORT_FONT}`;
  context.fillText(frame.title, EXPORT_PADDING, EXPORT_PADDING + 8);

  context.font = `11px ${EXPORT_FONT}`;
  let x = EXPORT_PADDING;
  for (const entry of frame.legend) {
    const labelWidth = context.measureText(entry.label).width;
    if (x + 14 + labelWidth > width + EXPORT_PADDING) break;
    context.fillStyle = entry.color;
    context.fillRect(x, EXPORT_PADDING + 26, 8, 8);
    context.fillStyle = "#667085";
    context.fillText(entry.label, x + 12, EXPORT_PADDING + 30);
    x += 12 + labelWidth + 14;
  }
  context.drawImage(image, EXPORT_PADDING, headerHeight, width, height);
  if (frame.note) {
    context.fillStyle = "#7b859a";
    context.fillText(frame.note, EXPORT_PADDING, headerHeight + height + 14);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The PNG could not be created.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = frame.fileName;
  link.click();
  URL.revokeObjectURL(url);
}
