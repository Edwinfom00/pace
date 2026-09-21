"use client";

import {
  createContext,
  useContext,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewFilter } from "../../domain/overview.types";

const DEFAULT_FILTER_LOADING_MINIMUM_DURATION_MS = 450;

type OverviewFilterLoadingContextValue = {
  activeFilter: OverviewFilter;
  isLoading: boolean;
  pendingFilter: OverviewFilter | null;
  selectFilter: (filter: OverviewFilter) => void;
};

const OverviewFilterLoadingContext = createContext<OverviewFilterLoadingContextValue | null>(null);

export function OverviewFilterLoadingProvider({
  children,
  minimumDurationMs = DEFAULT_FILTER_LOADING_MINIMUM_DURATION_MS,
  selectedFilter,
}: {
  children: ReactNode;
  minimumDurationMs?: number;
  selectedFilter: OverviewFilter;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isTransitionPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [pendingFilter, setPendingFilter] = useState<OverviewFilter | null>(null);
  const loadingStartedAt = useRef<number | null>(null);
  const [activeFilter, setActiveFilter] = useOptimistic(
    selectedFilter,
    (_currentFilter, nextFilter: OverviewFilter) => nextFilter,
  );

  useEffect(() => {
    if (isTransitionPending || !isLoading) return;

    const minimumDuration = Math.max(0, minimumDurationMs);
    const elapsed = loadingStartedAt.current === null
      ? minimumDuration
      : performance.now() - loadingStartedAt.current;
    const timeout = window.setTimeout(() => {
      loadingStartedAt.current = null;
      setIsLoading(false);
    }, Math.max(0, minimumDuration - elapsed));

    return () => window.clearTimeout(timeout);
  }, [isLoading, isTransitionPending, minimumDurationMs]);

  const selectFilter = (filter: OverviewFilter) => {
    if (filter === activeFilter || isLoading) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    if (filter === "ALL") nextParams.delete("filter");
    else nextParams.set("filter", filter);

    loadingStartedAt.current = performance.now();
    setIsLoading(true);
    setPendingFilter(filter);

    const query = nextParams.toString();
    startTransition(() => {
      setActiveFilter(filter);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return (
    <OverviewFilterLoadingContext.Provider value={{ activeFilter, isLoading, pendingFilter, selectFilter }}>
      {children}
    </OverviewFilterLoadingContext.Provider>
  );
}

export function useOverviewFilterLoading() {
  const context = useContext(OverviewFilterLoadingContext);
  if (!context) {
    throw new Error("useOverviewFilterLoading must be used within OverviewFilterLoadingProvider.");
  }
  return context;
}

export function OverviewFilterLoadingSurface({
  children,
  labels,
}: {
  children: ReactNode;
  labels: DashboardLabels;
}) {
  const { isLoading } = useOverviewFilterLoading();

  return (
    <FilterLoadingSurface
      detail={labels["overview.filters.loadingDetail"]}
      isLoading={isLoading}
      label={labels["overview.filters.loading"]}
    >
      {children}
    </FilterLoadingSurface>
  );
}
