"use client";

import { createContext, useCallback, useContext, useTransition } from "react";
import { HiOutlineArrowPath } from "react-icons/hi2";
import { useRouter } from "next/navigation";

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

export function TransactionNavigationProgress({ label }: { readonly label: string }) {
  const { isPending } = useTransactionNavigation();
  return (
    <div aria-live="polite" className="mb-3 flex h-5 items-center" role="status">
      {isPending ? (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#526785]">
          <HiOutlineArrowPath aria-hidden="true" className="size-3.5 animate-spin text-[#2f6fed] motion-reduce:animate-none" />
          {label}
        </span>
      ) : null}
    </div>
  );
}
