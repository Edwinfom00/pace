"use client";

import { startTransition, useOptimistic, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import { OVERVIEW_FILTERS, type OverviewFilter } from "../../domain/overview.types";

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
  selectedFilter,
}: {
  labels: DashboardLabels;
  selectedFilter: OverviewFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeFilter, setActiveFilter] = useOptimistic(
    selectedFilter,
    (_currentFilter, nextFilter: OverviewFilter) => nextFilter,
  );

  const selectFilter = (filter: OverviewFilter) => {
    if (filter === activeFilter) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (filter === "ALL") nextParams.delete("filter");
    else nextParams.set("filter", filter);
    const query = nextParams.toString();
    startTransition(() => {
      setActiveFilter(filter);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, filter: OverviewFilter) => {
    const next = nextOverviewFilterFromKey(filter, event.key);
    if (!next) return;
    event.preventDefault();
    document.getElementById(`overview-filter-${next}`)?.focus();
    selectFilter(next);
  };

  return (
    <div
      aria-label={labels["overview.filters.label"]}
      className="-mx-1 overflow-x-auto px-1 pb-1"
      role="radiogroup"
    >
      <div className="flex min-w-max items-center gap-2">
        {OVERVIEW_FILTERS.map((filter) => {
          const selected = activeFilter === filter;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "h-9 rounded-[8px] border px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#91b5fa] focus-visible:ring-offset-2",
                selected
                  ? "border-[#dce8ff] bg-[#edf4ff] text-[#2364d8]"
                  : "border-[#e6eaf0] bg-white text-[#667085] hover:border-[#d5deec] hover:bg-[#f8fafc] hover:text-[#475467]",
              )}
              id={`overview-filter-${filter}`}
              key={filter}
              onClick={() => selectFilter(filter)}
              onKeyDown={(event) => onKeyDown(event, filter)}
              role="radio"
              type="button"
            >
              {labels[filterLabelKeys[filter]]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
