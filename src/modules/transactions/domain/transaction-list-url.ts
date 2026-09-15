import type { TransactionFilterState } from "../types/transaction-ui.types";

export const TRANSACTIONS_PAGE_SIZE = 20;

export const DEFAULT_TRANSACTION_FILTER_STATE: TransactionFilterState = {
  kind: "ALL",
  search: "",
  sort: "NEWEST",
};

/** Produces a compact, shareable URL while retaining only non-default state. */
export function transactionListHref(pathname: string, state: TransactionFilterState & { readonly page: number }): string {
  const params = new URLSearchParams();
  if (state.page > 1) params.set("page", String(state.page));
  if (state.search) params.set("q", state.search);
  if (state.kind !== "ALL") params.set("type", state.kind);
  if (state.categoryId) params.set("category", state.categoryId);
  if (state.accountId) params.set("account", state.accountId);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.sort !== "NEWEST") params.set("sort", state.sort);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function hasActiveTransactionFilters(state: TransactionFilterState): boolean {
  return Boolean(
    state.search ||
      state.kind !== "ALL" ||
      state.categoryId ||
      state.accountId ||
      state.from ||
      state.to ||
      state.sort !== "NEWEST",
  );
}
