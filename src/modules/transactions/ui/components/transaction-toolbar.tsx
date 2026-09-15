"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { transactionListHref } from "../../domain/transaction-list-url";
import type { TransactionFilterOptions, TransactionFilterState, TransactionSortValue } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";
import { TransactionFilterBar } from "./transaction-filter-bar";
import { TransactionSortControl } from "./transaction-sort-control";

export function TransactionToolbar({
  labels,
  state,
  options,
  pathname,
  locale,
  amountSortingAvailable,
}: {
  readonly labels: TransactionUiLabels;
  readonly state: TransactionFilterState & { readonly page: number };
  readonly options: TransactionFilterOptions;
  readonly pathname: string;
  readonly locale: string;
  readonly amountSortingAvailable: boolean;
}) {
  const router = useRouter();
  const updateState = useCallback((next: Partial<TransactionFilterState & { page: number }>, replace = false) => {
    const href = transactionListHref(pathname, { ...state, ...next });
    router[replace ? "replace" : "push"](href, { scroll: false });
  }, [pathname, router, state]);

  return (
    <section aria-label={labels.filtersLabel} className="flex flex-col gap-2.5 border-y border-[#edf0f4] py-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
      <div className="min-w-0 flex-1">
        <TransactionFilterBar key={`${state.search}:${state.categoryId ?? ""}:${state.accountId ?? ""}:${state.from ?? ""}:${state.to ?? ""}`} labels={labels} locale={locale} onStateChange={updateState} options={options} state={state} />
      </div>
      <TransactionSortControl
        amountSortingAvailable={amountSortingAvailable}
        labels={labels}
        onValueChange={(sort: TransactionSortValue) => updateState({ page: 1, sort })}
        value={state.sort}
      />
    </section>
  );
}
