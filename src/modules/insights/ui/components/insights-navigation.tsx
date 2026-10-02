"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";
import type { DashboardLabels } from "@/i18n/dashboard-messages";

const MINIMUM_LOADING_DURATION_MS = 450;

export type InsightsSearchUpdate = Readonly<
  Record<"period" | "range" | "currency", string | null>
>;

type InsightsNavigationContextValue = {
  readonly isLoading: boolean;
  readonly pending: Partial<InsightsSearchUpdate> | null;
  readonly navigate: (update: Partial<InsightsSearchUpdate>) => void;
};

const InsightsNavigationContext =
  createContext<InsightsNavigationContextValue | null>(null);

export function insightsSearchQuery(
  current: string,
  update: Partial<InsightsSearchUpdate>,
): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) continue;
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}

export function InsightsNavigationProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isTransitionPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [pending, setPending] = useState<Partial<InsightsSearchUpdate> | null>(
    null,
  );
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (isTransitionPending || !isLoading) return;
    const elapsed =
      startedAt.current === null
        ? MINIMUM_LOADING_DURATION_MS
        : performance.now() - startedAt.current;
    const timeout = window.setTimeout(
      () => {
        startedAt.current = null;
        setIsLoading(false);
        setPending(null);
      },
      Math.max(0, MINIMUM_LOADING_DURATION_MS - elapsed),
    );
    return () => window.clearTimeout(timeout);
  }, [isLoading, isTransitionPending]);

  const navigate = (update: Partial<InsightsSearchUpdate>) => {
    const current = searchParams.toString();
    const query = insightsSearchQuery(current, update);
    if (isLoading || query === current) return;
    startedAt.current = performance.now();
    setIsLoading(true);
    setPending(update);
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
  };

  return (
    <InsightsNavigationContext.Provider
      value={{ isLoading, navigate, pending }}>
      {children}
    </InsightsNavigationContext.Provider>
  );
}

export function useInsightsNavigation() {
  const context = useContext(InsightsNavigationContext);
  if (!context)
    throw new Error(
      "useInsightsNavigation must be used within InsightsNavigationProvider.",
    );
  return context;
}

export function InsightsLoadingSurface({
  children,
  labels,
}: {
  readonly children: ReactNode;
  readonly labels: DashboardLabels;
}) {
  const { isLoading } = useInsightsNavigation();
  return (
    <FilterLoadingSurface
      detail={labels["insights.loadingDetail"]}
      isLoading={isLoading}
      label={labels["insights.loading"]}>
      {children}
    </FilterLoadingSurface>
  );
}
