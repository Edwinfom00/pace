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

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

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
    <div className="relative">
      <div
        aria-hidden={isLoading || undefined}
        className={cn(
          "transition-[filter,opacity] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isLoading && "pointer-events-none select-none opacity-35 blur-[1px]",
        )}
      >
        {children}
      </div>
      {isLoading ? (
        <div
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-start justify-center bg-[#fbfcfe]/72 px-4 pt-[clamp(5.5rem,17vw,9.5rem)] backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          role="status"
        >
          <div className="w-full max-w-90 rounded-[12px] border border-[#dce6f5] bg-white px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center">
                <span className="absolute inset-0 rounded-full border-2 border-[#dbe8fc]" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#2f75e8] border-r-[#2f75e8] motion-reduce:animate-none" />
                <PaceLogo alt="" height={23} variant="icon" width={23} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#1c2a46]">
                  {labels["overview.filters.loading"]}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-[#61718c]">
                  {labels["overview.filters.loadingDetail"]}
                </p>
              </div>
            </div>
            <div aria-hidden="true" className="mt-3 flex gap-1.5">
              <span className="h-1 flex-[1.2] animate-pulse rounded-full bg-[#cfe0fb] motion-reduce:animate-none" />
              <span className="h-1 flex-[0.75] animate-pulse rounded-full bg-[#dbe7f9] [animation-delay:160ms] motion-reduce:animate-none" />
              <span className="h-1 flex-1 animate-pulse rounded-full bg-[#cfe0fb] [animation-delay:320ms] motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
