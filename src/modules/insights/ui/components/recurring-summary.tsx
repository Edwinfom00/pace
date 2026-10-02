import type { ReactNode } from "react";

import {
  formatDashboardLabel,
  type DashboardLabels,
} from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InsightsMetric } from "../../overview/insights-overview.types";
import type { InsightsRecurring } from "../../recurring/insights-recurring.types";
import {
  formatComparisonPeriod,
  formatInsightsComparison,
  formatInsightsMoney,
  formatInsightsShare,
} from "../insights-format";
import { recurringStatusLines } from "../recurring-format";

const sentimentClasses = {
  positive: "text-[#0b8c5a]",
  negative: "text-[#c9483c]",
  neutral: "text-[#667085]",
} as const;

export function RecurringSummary({
  labels,
  recurring,
}: {
  readonly labels: DashboardLabels;
  readonly recurring: InsightsRecurring;
}) {
  const comparison = formatComparisonPeriod(
    recurring.previous,
    labels,
    recurring.locale,
  );
  const money = (minor: string) =>
    formatInsightsMoney(minor, recurring.currency, recurring.locale);
  const share = (bps: number) => formatInsightsShare(bps, recurring.locale);
  const change = (metric: InsightsMetric) => {
    const copy = formatInsightsComparison(metric, labels);
    return (
      <p
        className={cn(
          "min-w-0 text-[12px] leading-4.5 font-medium",
          metric.percentage === null && metric.direction !== "neutral"
            ? "text-[#98a2b3]"
            : sentimentClasses[metric.sentiment],
        )}
        title={`${money(metric.previousMinor)} · ${comparison}`}>
        {copy.arrow ? <span aria-hidden="true">{copy.arrow} </span> : null}
        {copy.text}
        <span className="sr-only">
          {" "}
          · {money(metric.previousMinor)} · {comparison}
        </span>
      </p>
    );
  };
  const statusLines = recurringStatusLines(recurring, labels);

  const cells: ReadonlyArray<{
    key: string;
    label: string;
    value: string;
    detail: ReactNode;
  }> = [
    {
      key: "spending",
      label: labels["insights.recurring.summary.spending"],
      value: money(recurring.actual.spending.minor),
      detail: change(recurring.actual.spending),
    },
    {
      key: "income",
      label: labels["insights.recurring.summary.income"],
      value: money(recurring.actual.income.minor),
      detail: change(recurring.actual.income),
    },
    {
      key: "share",
      label: labels["insights.recurring.summary.share"],
      value: share(recurring.actual.shareBps),
      detail: (
        <p className="min-w-0 truncate text-[12px] leading-4.5 text-[#71809a]">
          {formatDashboardLabel(labels, "insights.recurring.summary.shareDetail", {
            total: money(recurring.actual.totalSpendingMinor),
          })}
          <span className="sr-only">
            {" "}
            ·{" "}
            {formatDashboardLabel(
              labels,
              "insights.recurring.summary.sharePrevious",
              { share: share(recurring.actual.previousShareBps) },
            )}
          </span>
        </p>
      ),
    },
    {
      key: "commitments",
      label: labels["insights.recurring.summary.commitments"],
      value: String(recurring.counts.active),
      detail: (
        <p className="min-w-0 truncate text-[12px] leading-4.5 text-[#71809a]">
          {statusLines.join(" · ")}
        </p>
      ),
    },
  ];

  return (
    <section
      aria-label={labels["insights.recurring.summary.label"]}
      className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-[#e8ecf2] bg-white lg:grid-cols-4">
      {cells.map(({ key, label, value, detail }, index) => (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-1 px-4 py-3.5 sm:px-5",
            index % 2 === 1 && "border-l border-[#edf0f4]",
            index >= 2 && "border-t border-[#edf0f4] lg:border-t-0",
            index === 2 && "lg:border-l",
          )}
          key={key}>
          <p className="flex items-center gap-1.5 text-[12px] leading-4.5 font-medium text-[#667085]">
            {label}
            {key !== "commitments" ? (
              <span className="rounded-[4px] bg-[#eef4ff] px-1 text-[10px] leading-4 font-semibold tracking-wide text-[#1d5fd0] uppercase">
                {labels["insights.recurring.actual"]}
              </span>
            ) : null}
          </p>
          <p className="min-w-0 wrap-break-word text-[17px] leading-6 font-semibold tracking-tight text-[#101a35] tabular-nums sm:text-[19px]">
            {value}
          </p>
          {detail}
        </div>
      ))}
    </section>
  );
}
