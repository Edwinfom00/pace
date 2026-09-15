import { cn } from "@/lib/utils";

import type { OverviewMetric, OverviewTrendSentiment } from "../../domain/overview.types";

const sentimentClasses: Record<OverviewTrendSentiment, string> = {
  positive: "text-[#0b8c5a]",
  negative: "text-[#c9483c]",
  neutral: "text-[#667085]",
};

export function PaceKpiCard({
  label,
  value,
  metric,
  notApplicableLabel,
  insufficientDataLabel,
  noComparisonLabel,
  perDayLabel,
  trendDirectionLabels,
  versusLabel,
}: {
  label: string;
  value: string | null;
  metric: OverviewMetric;
  notApplicableLabel: string;
  insufficientDataLabel: string;
  noComparisonLabel: string;
  perDayLabel?: string;
  trendDirectionLabels: Record<"up" | "down" | "neutral", string>;
  versusLabel: string;
}) {
  const trend = metric.trend;
  const directionText = trend ? trendDirectionLabels[trend.direction] : "";
  const arrow = trend?.direction === "up" ? "↑" : trend?.direction === "down" ? "↓" : "→";
  const unavailableLabel = metric.availability === "insufficient-data" ? insufficientDataLabel : notApplicableLabel;

  return (
    <article className="flex min-h-[104px] min-w-0 flex-col justify-between rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
      <p className="text-[13px] leading-5 font-medium text-[#667085]">{label}</p>
      {metric.availability === "value" && value ? (
        <p className="min-w-0 break-words text-[21px] leading-7 font-semibold tracking-[-0.025em] text-[#101a35] sm:text-[23px]">
          {value}{perDayLabel ? <span className="ml-1 text-[16px] font-medium tracking-[-0.015em] text-[#44516a]">/ {perDayLabel}</span> : null}
        </p>
      ) : (
        <p className="text-[21px] leading-7 font-semibold text-[#98a2b3]" title={unavailableLabel}>—</p>
      )}
      {trend && trend.percentage !== null ? (
        <p
          aria-label={`${directionText} ${trend.percentage}% ${versusLabel.toLocaleLowerCase()} ${trend.comparisonMonth}`}
          className={cn("text-[13px] leading-5 font-medium", sentimentClasses[trend.sentiment])}
        >
          <span aria-hidden="true">{arrow} </span>
          {trend.percentage}% {versusLabel.toLocaleLowerCase()} {trend.comparisonMonth}
        </p>
      ) : (
        <p className="text-[13px] leading-5 text-[#98a2b3]">{metric.availability === "value" ? noComparisonLabel : unavailableLabel}</p>
      )}
    </article>
  );
}
