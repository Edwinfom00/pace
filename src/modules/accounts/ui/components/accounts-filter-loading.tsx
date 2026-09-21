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
import type { AccountListFilter } from "@/modules/accounts/domain/accounts-overview";

const MINIMUM_FILTER_LOADING_DURATION_MS = 350;

type AccountsFilterLoadingValue = {
  readonly activeFilter: AccountListFilter;
  readonly isLoading: boolean;
  readonly selectFilter: (filter: AccountListFilter) => void;
};

const AccountsFilterLoadingContext = createContext<AccountsFilterLoadingValue | null>(null);

export function AccountsFilterLoadingProvider({
  children,
  selectedFilter,
}: {
  readonly children: ReactNode;
  readonly selectedFilter: AccountListFilter;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isTransitionPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const loadingStartedAt = useRef<number | null>(null);
  const [activeFilter, setActiveFilter] = useOptimistic(
    selectedFilter,
    (_currentFilter, nextFilter: AccountListFilter) => nextFilter,
  );

  useEffect(() => {
    if (isTransitionPending || !isLoading) return;
    const elapsed = loadingStartedAt.current === null ? MINIMUM_FILTER_LOADING_DURATION_MS : performance.now() - loadingStartedAt.current;
    const timeout = window.setTimeout(() => {
      loadingStartedAt.current = null;
      setIsLoading(false);
    }, Math.max(0, MINIMUM_FILTER_LOADING_DURATION_MS - elapsed));
    return () => window.clearTimeout(timeout);
  }, [isLoading, isTransitionPending]);

  const selectFilter = (filter: AccountListFilter) => {
    if (filter === activeFilter || isLoading) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (filter === "ALL") nextParams.delete("filter");
    else nextParams.set("filter", filter);
    loadingStartedAt.current = performance.now();
    setIsLoading(true);
    const query = nextParams.toString();
    startTransition(() => {
      setActiveFilter(filter);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return <AccountsFilterLoadingContext.Provider value={{ activeFilter, isLoading, selectFilter }}>{children}</AccountsFilterLoadingContext.Provider>;
}

export function useAccountsFilterLoading(): AccountsFilterLoadingValue {
  const context = useContext(AccountsFilterLoadingContext);
  if (!context) throw new Error("Accounts filtering requires AccountsFilterLoadingProvider.");
  return context;
}

export function AccountsFilterLoadingSurface({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  const { isLoading } = useAccountsFilterLoading();
  return <FilterLoadingSurface isLoading={isLoading} label={label}>{children}</FilterLoadingSurface>;
}
