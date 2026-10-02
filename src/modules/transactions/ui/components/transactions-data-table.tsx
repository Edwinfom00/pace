"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HiArrowDown, HiArrowUp } from "react-icons/hi2";

import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { cn } from "@/lib/utils";

import { transactionCsvFileName, transactionsToCsv } from "../../domain/transaction-csv";
import { DEFAULT_TRANSACTION_FILTER_STATE, hasActiveTransactionFilters, transactionListHref } from "../../domain/transaction-list-url";
import type {
  TransactionFilterOptions,
  TransactionListItem,
  TransactionListState,
  TransactionPaginationState,
  TransactionSortValue,
} from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";
import { TransactionDateCell } from "./transaction-date-cell";
import { TransactionEmptyState } from "./transaction-empty-state";
import { formatTransactionAmount } from "./transaction-formatters";
import { TransactionListFilters, TransactionListTabs } from "./transaction-list-filters";
import { TransactionListPagination } from "./transaction-list-pagination";
import { TransactionMerchantCell } from "./transaction-merchant-cell";
import { TransactionMobileCard } from "./transaction-mobile-card";
import { useTransactionNavigation } from "./transaction-navigation";
import { TransactionRowActions } from "./transaction-row-actions";
import { TransactionStatusBadge } from "./transaction-status-badge";
import { TransactionTableSkeleton } from "./transaction-table-skeleton";

const headClass = "px-3 py-3 text-[12px] font-medium tracking-[-0.01em] text-[#53627b]";
const checkboxClass = "size-4 cursor-pointer rounded-[4px] border-[#cfd6e1] accent-[#2563eb]";

export function TransactionsDataTable({
  transactions,
  labels,
  locale,
  timeZone,
  now,
  pathname,
  state,
  pagination,
  filterOptions,
  amountSortingAvailable,
  exportHref,
  summary,
  loading = false,
}: {
  readonly transactions: readonly TransactionListItem[];
  readonly labels: TransactionUiLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly pathname: string;
  readonly state: TransactionListState;
  readonly pagination: TransactionPaginationState;
  readonly filterOptions: TransactionFilterOptions;
  readonly amountSortingAvailable: boolean;
  readonly exportHref: string;
  readonly summary?: ReactNode;
  readonly loading?: boolean;
}) {
  const router = useRouter();
  const { isPending, navigate } = useTransactionNavigation();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const selected = transactions.filter((transaction) => selectedIds.has(transaction.id));
  const allSelected = transactions.length > 0 && selected.length === transactions.length;
  const filtered = hasActiveTransactionFilters(state);
  const detailHref = (transaction: TransactionListItem) => `${pathname}/${transaction.id}`;

  const updateState = useCallback(
    (next: Partial<TransactionListState>, replace = false) => {
      setSelectedIds(new Set());
      navigate(pathname, { ...state, ...next }, replace);
    },
    [navigate, pathname, state],
  );

  const toggleRow = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportSelected = () => {
    const blob = new Blob([transactionsToCsv(selected, timeZone)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = transactionCsvFileName(new Date());
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const sortBy = (ascending: TransactionSortValue, descending: TransactionSortValue) =>
    updateState({ sort: state.sort === descending ? ascending : descending, page: 1 });

  return (
    <div className="space-y-4">
      <TransactionListTabs labels={labels} loading={isPending} onStateChange={updateState} state={state} />
      <TransactionListFilters
        amountSortingAvailable={amountSortingAvailable}
        exportHref={exportHref}
        labels={labels}
        loading={isPending}
        locale={locale}
        now={now}
        onExportSelected={exportSelected}
        onStateChange={updateState}
        options={filterOptions}
        selectedCount={selected.length}
        state={state}
        timeZone={timeZone}
      />
      {summary}
      <section aria-busy={isPending || loading} aria-label={labels.title}>
        {loading ? (
          <TransactionTableSkeleton />
        ) : transactions.length === 0 ? (
          <TransactionEmptyState
            clearFiltersHref={filtered ? transactionListHref(pathname, { ...DEFAULT_TRANSACTION_FILTER_STATE, page: 1 }) : undefined}
            filtered={filtered}
            labels={labels}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[12px] border border-[#e7ebf1] bg-white md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#e7ebf1]">
                      <th className="w-12 py-3 pr-1 pl-4 sm:pl-5" scope="col">
                        <input
                          aria-label={labels.selectAll}
                          checked={allSelected}
                          className={checkboxClass}
                          onChange={() => setSelectedIds(allSelected ? new Set() : new Set(transactions.map((transaction) => transaction.id)))}
                          ref={(element) => {
                            if (element) element.indeterminate = selected.length > 0 && !allSelected;
                          }}
                          type="checkbox"
                        />
                      </th>
                      <th className={cn(headClass, "min-w-56 border-r border-[#edf0f4]")} scope="col">{labels.columnMerchant}</th>
                      <SortableHead
                        active={state.sort === "NEWEST" || state.sort === "OLDEST"}
                        ascending={state.sort === "OLDEST"}
                        label={labels.columnDate}
                        onSort={() => sortBy("OLDEST", "NEWEST")}
                      />
                      <th className={headClass} scope="col">{labels.columnCategory}</th>
                      <th className={cn(headClass, "hidden lg:table-cell")} scope="col">{labels.columnAccount}</th>
                      <SortableHead
                        active={state.sort === "HIGHEST" || state.sort === "LOWEST"}
                        align="right"
                        ascending={state.sort === "LOWEST"}
                        disabled={!amountSortingAvailable}
                        label={labels.columnAmount}
                        onSort={() => sortBy("LOWEST", "HIGHEST")}
                        title={amountSortingAvailable ? undefined : labels.sortAmountUnavailable}
                      />
                      <th className={headClass} scope="col">{labels.columnStatus}</th>
                      <th className="w-12 px-2 py-3" scope="col">
                        <span className="sr-only">{labels.columnActions}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => {
                      const isSelected = selectedIds.has(transaction.id);
                      return (
                        <tr
                          aria-selected={isSelected}
                          className={cn(
                            "border-b border-[#edf0f4] transition-colors last:border-b-0",
                            isSelected ? "bg-[#f5f9ff]" : "bg-white hover:bg-[#fbfcfe]",
                          )}
                          key={transaction.id}
                        >
                          <td className="py-3 pr-1 pl-4 sm:pl-5">
                            <input
                              aria-label={labels.selectRow.replace("{name}", transaction.merchant.name)}
                              checked={isSelected}
                              className={checkboxClass}
                              onChange={() => toggleRow(transaction.id)}
                              type="checkbox"
                            />
                          </td>
                          <td className="min-w-56 border-r border-[#edf0f4] px-3 py-3">
                            <Link
                              className="block rounded-[7px] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]"
                              href={detailHref(transaction)}
                            >
                              <TransactionMerchantCell category={transaction.category} kind={transaction.kind} merchant={transaction.merchant} />
                            </Link>
                          </td>
                          <td className="px-3 py-3">
                            <TransactionDateCell
                              labels={{ today: labels.today, yesterday: labels.yesterday }}
                              locale={locale}
                              now={now}
                              occurredAt={transaction.occurredAt}
                              timeZone={timeZone}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <CategoryPill category={transaction.category} kind={transaction.kind} uncategorizedLabel={labels.uncategorized} />
                          </td>
                          <td className="hidden px-3 py-3 lg:table-cell">
                            <span className="block max-w-40 truncate text-[12px] text-[#667895]">
                              {transaction.account?.displayName ?? labels.accountUnavailable}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span
                              className={cn(
                                "whitespace-nowrap text-[13px] font-semibold tabular-nums tracking-[-0.01em]",
                                transaction.kind === "EXPENSE" && "text-[#d92d20]",
                                (transaction.kind === "INCOME" || transaction.kind === "REFUND") && "text-[#078652]",
                                transaction.kind === "TRANSFER" && "text-[#1b2844]",
                              )}
                            >
                              {formatTransactionAmount(transaction.amount, transaction.kind, locale)}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <TransactionStatusBadge pendingLabel={labels.statusPending} postedLabel={labels.statusPosted} status={transaction.status} />
                          </td>
                          <td className="px-2 py-3 text-right">
                            <TransactionRowActions
                              actions={[{ id: "view", label: labels.actionView, onSelect: () => router.push(detailHref(transaction)) }]}
                              label={labels.actionsMenu}
                              merchantName={transaction.merchant.name}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TransactionListPagination
                labels={labels}
                loading={isPending}
                onPageChange={(page) => updateState({ page })}
                onPageSizeChange={(pageSize) => updateState({ pageSize, page: 1 })}
                pagination={pagination}
              />
            </div>
            <div className="space-y-2.5 md:hidden">
              {transactions.map((transaction) => (
                <TransactionMobileCard
                  detailHref={detailHref(transaction)}
                  key={transaction.id}
                  labels={labels}
                  locale={locale}
                  now={now}
                  timeZone={timeZone}
                  transaction={transaction}
                />
              ))}
              <div className="overflow-hidden rounded-[12px] border border-[#e7ebf1] bg-white">
                <TransactionListPagination
                  labels={labels}
                  loading={isPending}
                  onPageChange={(page) => updateState({ page })}
                  onPageSizeChange={(pageSize) => updateState({ pageSize, page: 1 })}
                  pagination={pagination}
                />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SortableHead({
  label,
  active,
  ascending,
  align = "left",
  disabled = false,
  title,
  onSort,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly ascending: boolean;
  readonly align?: "left" | "right";
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onSort: () => void;
}) {
  return (
    <th
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
      className={cn(headClass, align === "right" && "text-right")}
      scope="col"
    >
      <button
        className={cn(
          "inline-flex items-center gap-1 rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed",
          active ? "text-[#1b2844]" : "hover:text-[#1b2844]",
        )}
        disabled={disabled}
        onClick={onSort}
        title={title}
        type="button"
      >
        {label}
        {active ? (
          ascending ? <HiArrowUp aria-hidden="true" className="size-3.5" /> : <HiArrowDown aria-hidden="true" className="size-3.5" />
        ) : null}
      </button>
    </th>
  );
}

function CategoryPill({
  category,
  kind,
  uncategorizedLabel,
}: {
  readonly category: TransactionListItem["category"];
  readonly kind: TransactionListItem["kind"];
  readonly uncategorizedLabel: string;
}) {
  const visual = resolveTransactionIcon({ categoryKey: category?.key, categoryName: category?.label, transactionKind: kind });

  return (
    <span className="inline-flex max-w-40 items-center gap-1.5 rounded-full border border-[#e7ebf1] bg-[#f8fafc] px-2.5 py-1 text-[12px] leading-4 text-[#53627b]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" aria-hidden="true" className="size-3.5 shrink-0 opacity-70" height="14" src={visual.iconPath} width="14" />
      <span className="truncate">{category?.label ?? uncategorizedLabel}</span>
    </span>
  );
}
