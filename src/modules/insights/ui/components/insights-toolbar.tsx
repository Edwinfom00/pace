"use client";

import type { KeyboardEvent } from "react";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { OverviewPeriodControls } from "@/modules/overview/ui/components/overview-period-controls";

import {
  INSIGHTS_RANGES,
  type InsightsCurrencyOption,
  type InsightsRange,
} from "../../overview/insights-overview.types";
import { useInsightsNavigation } from "./insights-navigation";

export function nextInsightsRange(
  current: InsightsRange,
  key: string,
): InsightsRange | null {
  const index = INSIGHTS_RANGES.indexOf(current);
  if (key === "ArrowRight")
    return INSIGHTS_RANGES[(index + 1) % INSIGHTS_RANGES.length]!;
  if (key === "ArrowLeft")
    return INSIGHTS_RANGES[
      (index - 1 + INSIGHTS_RANGES.length) % INSIGHTS_RANGES.length
    ]!;
  if (key === "Home") return INSIGHTS_RANGES[0];
  if (key === "End") return INSIGHTS_RANGES.at(-1)!;
  return null;
}

export function InsightsPeriodControls({
  currentPeriodKey,
  labels,
  locale,
  periodKey,
}: {
  readonly currentPeriodKey: string;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly periodKey: string;
}) {
  const { isLoading, navigate } = useInsightsNavigation();
  return (
    <OverviewPeriodControls
      busy={isLoading}
      currentPeriodKey={currentPeriodKey}
      label={labels["insights.period.label"]}
      labels={labels}
      locale={locale}
      onSelectPeriod={(period) => navigate({ period })}
      periodKey={periodKey}
    />
  );
}

export function InsightsFilters({
  currencies,
  currency,
  labels,
  range,
  workspaceCurrency,
}: {
  readonly currencies: readonly InsightsCurrencyOption[];
  readonly currency: string;
  readonly labels: DashboardLabels;
  readonly range: InsightsRange;
  readonly workspaceCurrency: string;
}) {
  const { isLoading, navigate, pending } = useInsightsNavigation();
  const activeRange = (pending?.range ??
    (pending && "range" in pending ? "1m" : range)) as InsightsRange;
  const activeCurrency =
    pending?.currency ??
    (pending && "currency" in pending ? workspaceCurrency : currency);
  const selectRange = (next: InsightsRange) =>
    navigate({ range: next === "1m" ? null : next });

  const onRangeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextInsightsRange(activeRange, event.key);
    if (!next) return;
    event.preventDefault();
    selectRange(next);
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-range="${next}"]`)
      ?.focus();
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        aria-label={labels["insights.range.label"]}
        className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-none"
        onKeyDown={onRangeKeyDown}
        role="radiogroup">
        {INSIGHTS_RANGES.map((option) => {
          const selected = option === activeRange;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "h-9 shrink-0 rounded-[8px] border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2 disabled:cursor-wait",
                selected
                  ? "border-[#101a35] bg-[#101a35] text-white"
                  : "border-[#e5eaf1] bg-white text-[#44516a] hover:border-[#d4ddea] hover:bg-[#f8fafc]",
              )}
              data-range={option}
              disabled={isLoading && !selected}
              key={option}
              onClick={() => selectRange(option)}
              role="radio"
              tabIndex={selected ? 0 : -1}
              type="button">
              {labels[`insights.range.${option}`]}
            </button>
          );
        })}
      </div>
      {currencies.length > 1 ? (
        <label className="flex shrink-0 items-center gap-2 text-[13px] text-[#667085]">
          <span>{labels["insights.currency.label"]}</span>
          <select
            className="h-9 rounded-[8px] border border-[#e5eaf1] bg-white px-2.5 text-[13px] font-medium text-[#25314a] outline-none focus-visible:ring-2 focus-visible:ring-[#91b5fa] disabled:cursor-wait"
            disabled={isLoading}
            onChange={(event) =>
              navigate({
                currency:
                  event.target.value === workspaceCurrency
                    ? null
                    : event.target.value,
              })
            }
            title={labels["insights.currency.note"]}
            value={activeCurrency}>
            {currencies.map((option) => (
              <option key={option.code} value={option.code}>
                {option.code}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
