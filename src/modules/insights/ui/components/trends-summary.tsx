import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InsightsMetric } from "../../overview/insights-overview.types";
import type { InsightsTrends } from "../../trends/insights-trends.types";
import {
  formatComparisonPeriod,
  formatInsightsComparison,
  formatInsightsMoney,
} from "../insights-format";

const sentimentClasses = {
  positive: "text-[#0b8c5a]",
  negative: "text-[#c9483c]",
  neutral: "text-[#667085]",
} as const;

export function TrendsSummary({
  labels,
  trends,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
}) {
  const comparison = formatComparisonPeriod(
    trends.previous,
    labels,
    trends.locale,
  );
  const money = (minor: string) =>
    formatInsightsMoney(minor, trends.currency, trends.locale);
  const cells: ReadonlyArray<{
    key: string;
    label: string;
    metric: InsightsMetric;
  }> = [
    {
      key: "income",
      label: labels["insights.trends.summary.income"],
      metric: trends.totals.income,
    },
    {
      key: "spending",
      label: labels["insights.trends.summary.spending"],
      metric: trends.totals.spending,
    },
    {
      key: "net",
      label: labels["insights.trends.summary.net"],
      metric: trends.totals.net,
    },
    {
      key: "recurring",
      label: labels["insights.trends.summary.recurring"],
      metric: trends.totals.recurring,
    },
  ];

  return (
    <section
      aria-label={labels["insights.trends.summary.label"]}
      className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#e8ecf2] bg-white lg:grid-cols-4">
      {cells.map(({ key, label, metric }, index) => {
        const change = formatInsightsComparison(metric, labels);
        return (
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5",
              index % 2 === 1 && "border-l border-[#edf0f4]",
              index >= 2 && "border-t border-[#edf0f4] lg:border-t-0",
              index === 2 && "lg:border-l",
            )}
            key={key}>
            <p className="text-[12px] leading-4.5 font-medium text-[#667085]">
              {label}
            </p>
            <p className="min-w-0 wrap-break-word text-[17px] leading-6 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[19px]">
              {money(metric.minor)}
            </p>
            <p
              className={cn(
                "min-w-0 text-[12px] leading-4.5 font-medium",
                metric.percentage === null && metric.direction !== "neutral"
                  ? "text-[#98a2b3]"
                  : sentimentClasses[metric.sentiment],
              )}
              title={`${money(metric.previousMinor)} · ${comparison}`}>
              {change.arrow ? (
                <span aria-hidden="true">{change.arrow} </span>
              ) : null}
              {change.text}
              <span className="sr-only">
                {" "}
                · {money(metric.previousMinor)} · {comparison}
              </span>
            </p>
          </div>
        );
      })}
    </section>
  );
}
