"use client";

import type { KeyboardEvent } from "react";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import { OVERVIEW_FILTERS, type OverviewFilter } from "../../domain/overview.types";
import { useOverviewFilterLoading } from "./overview-filter-loading";

const filterLabelKeys = {
  ALL: "overview.filters.all",
  EXPENSE: "overview.filters.expenses",
  INCOME: "overview.filters.income",
  TRANSFER: "overview.filters.transfers",
} as const;

export function nextOverviewFilterFromKey(filter: OverviewFilter, key: string): OverviewFilter | null {
  const index = OVERVIEW_FILTERS.indexOf(filter);
  if (key === "ArrowRight" || key === "ArrowDown") return OVERVIEW_FILTERS[(index + 1) % OVERVIEW_FILTERS.length]!;
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return OVERVIEW_FILTERS[(index - 1 + OVERVIEW_FILTERS.length) % OVERVIEW_FILTERS.length]!;
  }
  if (key === "Home") return OVERVIEW_FILTERS[0];
  if (key === "End") return OVERVIEW_FILTERS.at(-1)!;
  return null;
}

export function OverviewFilters({
  labels,
}: {
  labels: DashboardLabels;
}) {
  const { activeFilter, isLoading, pendingFilter, selectFilter } = useOverviewFilterLoading();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, filter: OverviewFilter) => {
    const next = nextOverviewFilterFromKey(filter, event.key);
    if (!next) return;
    event.preventDefault();
    document.getElementById(`overview-filter-${next}`)?.focus();
    selectFilter(next);
  };

  return (
    <div
      className="-mx-1 overflow-x-auto px-1 pb-1"
    >
      <div className="flex min-w-max items-center gap-2">
        <div
          aria-busy={isLoading}
          aria-label={labels["overview.filters.label"]}
          className="flex items-center gap-2"
          role="radiogroup"
        >
          {OVERVIEW_FILTERS.map((filter) => {
            const selected = activeFilter === filter;
            const isUpdatingThisFilter = isLoading && pendingFilter === filter;
            return (
              <button
                aria-checked={selected}
                className={cn(
                  "relative h-9 overflow-hidden rounded-[8px] border px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70",
                  selected
                    ? "border-[#dce8ff] bg-[#edf4ff] text-[#2364d8]"
                    : "border-[#e6eaf0] bg-white text-[#667085] hover:border-[#d5deec] hover:bg-[#f8fafc] hover:text-[#475467]",
                )}
                disabled={isLoading}
                id={`overview-filter-${filter}`}
                key={filter}
                onClick={() => selectFilter(filter)}
                onKeyDown={(event) => onKeyDown(event, filter)}
                role="radio"
                type="button"
              >
                {labels[filterLabelKeys[filter]]}
                {isUpdatingThisFilter ? (
                  <span
                    aria-hidden="true"
                    className="absolute right-2 bottom-0.75 left-2 h-0.5 overflow-hidden rounded-full bg-[#c9dcff]"
                  >
                    <span className="block h-full w-2/3 animate-pulse rounded-full bg-[#3476df] motion-reduce:animate-none" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
