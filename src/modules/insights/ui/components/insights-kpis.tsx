import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type {
  InsightsMetric,
  InsightsOverview,
} from "../../overview/insights-overview.types";
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

export function InsightsKpis({
  labels,
  overview,
}: {
  readonly labels: DashboardLabels;
  readonly overview: InsightsOverview;
}) {
  const comparison = formatComparisonPeriod(
    overview.previous,
    labels,
    overview.locale,
  );
  const cards: ReadonlyArray<{
    key: string;
    label: string;
    metric: InsightsMetric;
  }> = [
    {
      key: "spending",
      label: labels["insights.kpi.spending"],
      metric: overview.kpis.spending,
    },
    {
      key: "income",
      label: labels["insights.kpi.income"],
      metric: overview.kpis.income,
    },
    {
      key: "net",
      label: labels["insights.kpi.net"],
      metric: overview.kpis.net,
    },
    {
      key: "daily",
      label: labels["insights.kpi.dailyAverage"],
      metric: overview.kpis.dailyAverage,
    },
  ];

  return (
    <section
      aria-label={labels["insights.kpi.label"]}
      className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ key, label, metric }) => {
        const change = formatInsightsComparison(metric, labels);
        return (
          <article
            className="flex min-h-28 min-w-0 flex-col justify-between gap-2 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5"
            key={key}>
            <p className="text-[13px] leading-5 font-medium text-[#667085]">
              {label}
            </p>
            <p className="min-w-0 wrap-break-word text-[19px] leading-7 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[22px]">
              {formatInsightsMoney(
                metric.minor,
                overview.currency,
                overview.locale,
              )}
            </p>
            <p
              className={cn(
                "min-w-0 text-[12px] leading-4.5 font-medium",
                metric.percentage === null && metric.direction !== "neutral"
                  ? "text-[#98a2b3]"
                  : sentimentClasses[metric.sentiment],
              )}
              title={`${formatInsightsMoney(metric.previousMinor, overview.currency, overview.locale)} · ${comparison}`}>
              {change.arrow ? (
                <span aria-hidden="true">{change.arrow} </span>
              ) : null}
              {change.text}
              <span className="sr-only">
                {" "}
                ·{" "}
                {formatInsightsMoney(
                  metric.previousMinor,
                  overview.currency,
                  overview.locale,
                )}{" "}
                · {comparison}
              </span>
            </p>
          </article>
        );
      })}
    </section>
  );
}
