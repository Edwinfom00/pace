import { FiArrowDownRight, FiArrowUpRight } from "react-icons/fi";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InsightsOverview } from "../../overview/insights-overview.types";
import { formatInsightsMoney } from "../insights-format";

export function InsightsTopChanges({
  labels,
  overview,
}: {
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
}) {
  const { currency, locale, topChanges } = overview;
  const money = (minor: string) => formatInsightsMoney(minor, currency, locale);

  return (
    <section
      aria-labelledby="insights-changes-title"
      className="min-w-0 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <h2
        className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
        id="insights-changes-title">
        {labels["insights.changes.title"]}
      </h2>
      {topChanges.length ? (
        <ul className="mt-2 divide-y divide-[#edf0f4]">
          {topChanges.map((change) => {
            const increased = change.direction === "up";
            const Icon = increased ? FiArrowUpRight : FiArrowDownRight;
            return (
              <li
                className="flex items-center gap-3 py-3 last:pb-0"
                key={`${change.dimension}:${change.id}`}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    increased
                      ? "bg-[#fff2e7] text-[#b46021]"
                      : "bg-[#eaf8f0] text-[#128257]",
                  )}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] leading-5 font-medium text-[#1c2740]">
                    {change.name}
                  </p>
                  <p className="truncate text-[12px] leading-5 text-[#71809a]">
                    {
                      labels[
                        change.dimension === "category"
                          ? "insights.changes.category"
                          : "insights.changes.merchant"
                      ]
                    }
                    {" · "}
                    {formatDashboardLabel(labels, "insights.changes.from", {
                      current: money(change.currentMinor),
                      previous: money(change.previousMinor),
                    })}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p
                    className={cn(
                      "text-[13px] leading-5 font-semibold",
                      increased ? "text-[#b4483c]" : "text-[#0b8c5a]",
                    )}>
                    {increased ? "+" : ""}
                    {money(change.deltaMinor)}
                  </p>
                  <p className="text-[12px] leading-5 text-[#71809a]">
                    {change.percentage !== null
                      ? `${increased ? "+" : "−"}${change.percentage}%`
                      : change.previousMinor === "0"
                        ? labels["insights.changes.new"]
                        : "—"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-[14px] text-[#667085]">
          {labels["insights.changes.empty"]}
        </p>
      )}
    </section>
  );
}
