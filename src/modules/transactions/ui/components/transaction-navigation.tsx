"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";

import { FilterLoadingSurface } from "@/components/pace/shared/filter-loading-surface";

import { transactionListHref } from "../../domain/transaction-list-url";
import type { TransactionFilterState } from "../../types/transaction-ui.types";

type TransactionNavigationContextValue = {
  readonly isPending: boolean;
  readonly navigate: (pathname: string, state: TransactionFilterState & { readonly page: number }, replace?: boolean) => void;
};

const TransactionNavigationContext = createContext<TransactionNavigationContextValue | null>(null);

export function TransactionNavigationProvider({ children }: { readonly children: React.ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback((pathname: string, state: TransactionFilterState & { readonly page: number }, replace = false) => {
    const href = transactionListHref(pathname, state);
    startTransition(() => router[replace ? "replace" : "push"](href, { scroll: false }));
  }, [router]);

  return <TransactionNavigationContext.Provider value={{ isPending, navigate }}>{children}</TransactionNavigationContext.Provider>;
}

export function useTransactionNavigation(): TransactionNavigationContextValue {
  const value = useContext(TransactionNavigationContext);
  if (!value) throw new Error("Transaction navigation requires TransactionNavigationProvider.");
  return value;
}

export function TransactionNavigationLoadingSurface({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  const { isPending } = useTransactionNavigation();

  return (
    <FilterLoadingSurface isLoading={isPending} label={label}>
      {children}
    </FilterLoadingSurface>
  );
}
