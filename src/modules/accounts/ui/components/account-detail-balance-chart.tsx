"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  formatCompactOverviewAmount,
  formatOverviewDate,
  formatOverviewMoney,
  minorToChartValue,
} from "@/modules/overview/domain/overview-formatters";

import type { AccountDetailChartPoint } from "../../domain/account-detail";
import type { AccountDetailUiLabels } from "../account-detail-ui-labels";

type BalanceChartPoint = AccountDetailChartPoint & { readonly value: number };

export function AccountDetailBalanceChart({
  currency,
  labels,
  locale,
  points,
}: {
  readonly currency: string;
  readonly labels: AccountDetailUiLabels;
  readonly locale: string;
  readonly points: readonly AccountDetailChartPoint[];
}) {
  const isMobile = useIsMobile();
  const chartPoints: BalanceChartPoint[] = points.map((point) => ({
    ...point,
    value: minorToChartValue(point.balanceMinor, currency),
  }));
  const visibleIndexes = visibleChartIndexes(chartPoints.length, isMobile);
  const latest = chartPoints.at(-1);

  if (!chartPoints.length) {
    return (
      <div className="mt-4 flex h-54 items-center justify-center text-[13px] text-[#667895]">
        —
      </div>
    );
  }

  return (
    <>
      <p className="sr-only">
        {labels.chartSummary
          .replace("{date}", formatOverviewDate(latest?.date ?? "", locale))
          .replace(
            "{amount}",
            formatOverviewMoney(latest?.balanceMinor ?? "0", currency, locale),
          )}
      </p>
      <div className="mt-4 h-54 min-w-0 sm:h-58">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={chartPoints}
            margin={{
              top: 8,
              right: isMobile ? 2 : 8,
              bottom: 0,
              left: isMobile ? -12 : -3,
            }}
          >
            <CartesianGrid
              stroke="#edf1f6"
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="date"
              interval="preserveStartEnd"
              tick={{ fill: "#71809a", fontSize: 11 }}
              tickFormatter={(date) => {
                const index = chartPoints.findIndex(
                  (point) => point.date === date,
                );
                return visibleIndexes.includes(index)
                  ? formatOverviewDate(date, locale)
                  : "";
              }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              hide={isMobile}
              tick={{ fill: "#71809a", fontSize: 11 }}
              tickFormatter={(value: number) =>
                formatCompactOverviewAmount(value, locale)
              }
              tickLine={false}
              width={54}
            />
            <Tooltip
              allowEscapeViewBox={{ x: false, y: false }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as
                  | BalanceChartPoint
                  | undefined;
                if (!active || !point) return null;
                return (
                  <div className="rounded-[8px] border border-[#dfe7f1] bg-white px-3 py-2 shadow-[0_4px_8px_rgb(16_24_40/8%)]">
                    <p className="text-[11px] text-[#71809a]">
                      {formatOverviewDate(point.date, locale)}
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#14203a]">
                      {formatOverviewMoney(
                        point.balanceMinor,
                        currency,
                        locale,
                      )}
                    </p>
                  </div>
                );
              }}
              cursor={{
                stroke: "#a4bee9",
                strokeDasharray: "3 3",
                strokeWidth: 1,
              }}
              wrapperStyle={{ outline: "none" }}
            />
            <Line
              activeDot={{
                fill: "#2874e8",
                r: 4,
                stroke: "white",
                strokeWidth: 2,
              }}
              dataKey="value"
              dot={false}
              isAnimationActive={false}
              stroke="#2874e8"
              strokeWidth={2.25}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function visibleChartIndexes(length: number, mobile: boolean): number[] {
  if (length <= 1) return [0];
  const positions = mobile
    ? [0, Math.floor((length - 1) / 2), length - 1]
    : [0, 0.25, 0.5, 0.75, 1].map((value) => Math.round((length - 1) * value));
  return [...new Set(positions)];
}
