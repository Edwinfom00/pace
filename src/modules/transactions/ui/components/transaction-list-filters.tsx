"use client";

import { useEffect, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineCalendarDays,
  HiOutlineChevronDown,
  HiOutlineCreditCard,
  HiOutlineMagnifyingGlass,
  HiOutlineSquares2X2,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { hasActiveTransactionFilters } from "../../domain/transaction-list-url";
import type {
  TransactionFilterKind,
  TransactionFilterOptions,
  TransactionListState,
  TransactionSortValue,
} from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

type TabValue = TransactionFilterKind | "PENDING";
type StateChange = (
  next: Partial<TransactionListState>,
  replace?: boolean,
) => void;

const tabValues: readonly TabValue[] = [
  "ALL",
  "EXPENSE",
  "INCOME",
  "TRANSFER",
  "REFUND",
  "PENDING",
];
const sortValues: readonly TransactionSortValue[] = [
  "NEWEST",
  "OLDEST",
  "HIGHEST",
  "LOWEST",
];
const menuItemClass =
  "rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]";
const menuItemActiveClass = "bg-[#f3f6fa] font-medium text-[#1b2844]";
const menuContentClass =
  "rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]";

export function TransactionListTabs({
  labels,
  state,
  loading,
  onStateChange,
}: {
  readonly labels: TransactionUiLabels;
  readonly state: TransactionListState;
  readonly loading: boolean;
  readonly onStateChange: StateChange;
}) {
  const [search, setSearch] = useState(state.search);
  const [submittedSearch, setSubmittedSearch] = useState(state.search);
  if (state.search !== submittedSearch) {
    setSubmittedSearch(state.search);
    setSearch(state.search);
  }
  const tabLabel: Record<TabValue, string> = {
    ALL: labels.tabAll,
    EXPENSE: labels.filterExpense,
    INCOME: labels.filterIncome,
    TRANSFER: labels.filterTransfer,
    REFUND: labels.filterRefund,
    PENDING: labels.tabPending,
  };
  const activeTab: TabValue =
    state.status === "PENDING" ? "PENDING" : state.kind;

useEffect(() => {
    const normalized = search.trim();
    if (normalized === submittedSearch) return;
    const timer = window.setTimeout(() => {
      setSubmittedSearch(normalized);
      onStateChange({ page: 1, search: normalized }, true);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [onStateChange, search, submittedSearch]);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div
        aria-label={labels.filtersLabel}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-none"
        role="group">
        {tabValues.map((tab) => (
          <button
            aria-pressed={activeTab === tab}
            className={cn(
              "h-8 shrink-0 rounded-[8px] border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:opacity-60",
              activeTab === tab
                ? "border-[#dbe7ff] bg-[#eef5ff] text-[#2563eb]"
                : "border-[#e3e8ef] bg-white text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]",
            )}
            disabled={loading}
            key={tab}
            onClick={() =>
              onStateChange(
                tab === "PENDING"
                  ? { kind: "ALL", status: "PENDING", page: 1 }
                  : { kind: tab, status: undefined, page: 1 },
              )
            }
            type="button">
            {tabLabel[tab]}
          </button>
        ))}
      </div>
      <label className="relative block w-full lg:max-w-70">
        <span className="sr-only">{labels.searchLabel}</span>
        <HiOutlineMagnifyingGlass
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#7b879e]"
        />
        <Input
          className="h-9 rounded-[8px] border-[#e3e8ef] bg-white pr-3 pl-9 text-[13px] text-[#34405d] placeholder:text-[#8b98ae] focus-visible:border-[#93b4f8] focus-visible:ring-2 focus-visible:ring-[#dce9ff]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          value={search}
        />
      </label>
    </div>
  );
}

export function TransactionListFilters({
  labels,
  state,
  options,
  locale,
  timeZone,
  now,
  loading,
  amountSortingAvailable,
  exportHref,
  selectedCount,
  onExportSelected,
  onStateChange,
}: {
  readonly labels: TransactionUiLabels;
  readonly state: TransactionListState;
  readonly options: TransactionFilterOptions;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly loading: boolean;
  readonly amountSortingAvailable: boolean;
  readonly exportHref: string;
  readonly selectedCount: number;
  readonly onExportSelected: () => void;
  readonly onStateChange: StateChange;
}) {
  const selectedCategory = options.categories.find(
    (option) => option.id === state.categoryId,
  );
  const selectedAccount = options.accounts.find(
    (option) => option.id === state.accountId,
  );
  const sortLabel: Record<TransactionSortValue, string> = {
    NEWEST: labels.sortNewest,
    OLDEST: labels.sortOldest,
    HIGHEST: labels.sortHighest,
    LOWEST: labels.sortLowest,
  };
  const exportClass =
    "inline-flex h-9 shrink-0 items-center gap-2 rounded-[8px] border border-[#e3e8ef] bg-white px-3 text-[12px] font-medium text-[#34405d] transition-colors hover:border-[#d5ddea] hover:bg-[#f8fafc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]";

  return (
    <section
      aria-label={labels.filtersLabel}
      aria-busy={loading}
      className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <fieldset
        className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-none"
        disabled={loading}>
        <PeriodMenu
          labels={labels}
          locale={locale}
          now={now}
          onStateChange={onStateChange}
          state={state}
          timeZone={timeZone}
        />
        <FilterMenu
          icon={<HiOutlineCreditCard aria-hidden="true" className="size-4" />}
          label={selectedAccount?.label ?? labels.filterAllAccounts}>
          <DropdownMenuItem
            className={cn(
              menuItemClass,
              !state.accountId && menuItemActiveClass,
            )}
            onSelect={() => onStateChange({ accountId: undefined, page: 1 })}>
            {labels.filterAllAccounts}
          </DropdownMenuItem>
          {options.accounts.map((account) => (
            <DropdownMenuItem
              className={cn(
                menuItemClass,
                state.accountId === account.id && menuItemActiveClass,
              )}
              key={account.id}
              onSelect={() =>
                onStateChange({ accountId: account.id, page: 1 })
              }>
              {account.label}
            </DropdownMenuItem>
          ))}
        </FilterMenu>
        <FilterMenu
          icon={<HiOutlineSquares2X2 aria-hidden="true" className="size-4" />}
          label={selectedCategory?.label ?? labels.filterAllCategories}>
          <DropdownMenuItem
            className={cn(
              menuItemClass,
              !state.categoryId && menuItemActiveClass,
            )}
            onSelect={() => onStateChange({ categoryId: undefined, page: 1 })}>
            {labels.filterAllCategories}
          </DropdownMenuItem>
          {options.categories.map((category) => (
            <DropdownMenuItem
              className={cn(
                menuItemClass,
                state.categoryId === category.id && menuItemActiveClass,
              )}
              key={category.id}
              onSelect={() =>
                onStateChange({ categoryId: category.id, page: 1 })
              }>
              {category.label}
            </DropdownMenuItem>
          ))}
        </FilterMenu>
        <FilterMenu ariaLabel={labels.sortLabel} label={sortLabel[state.sort]}>
          {sortValues.map((sort) => {
            const unavailable =
              !amountSortingAvailable &&
              (sort === "HIGHEST" || sort === "LOWEST");
            return (
              <DropdownMenuItem
                className={cn(
                  menuItemClass,
                  state.sort === sort && menuItemActiveClass,
                )}
                disabled={unavailable}
                key={sort}
                onSelect={() => onStateChange({ sort, page: 1 })}
                title={unavailable ? labels.sortAmountUnavailable : undefined}>
                {sortLabel[sort]}
              </DropdownMenuItem>
            );
          })}
        </FilterMenu>
        {hasActiveTransactionFilters(state) ? (
          <Button
            className="h-9 shrink-0 rounded-[8px] px-2.5 text-[12px] text-[#53627b] hover:bg-[#f3f6fa] hover:text-[#34405d]"
            onClick={() =>
              onStateChange({
                kind: "ALL",
                status: undefined,
                search: "",
                sort: "NEWEST",
                accountId: undefined,
                categoryId: undefined,
                from: undefined,
                to: undefined,
                page: 1,
              })
            }
            type="button"
            variant="ghost">
            <HiOutlineXMark aria-hidden="true" className="size-3.5" />
            {labels.filterClear}
          </Button>
        ) : null}
      </fieldset>
      {selectedCount > 0 ? (
        <button
          className={exportClass}
          onClick={onExportSelected}
          type="button">
          <HiOutlineArrowDownTray aria-hidden="true" className="size-4" />
          {labels.exportSelected.replace("{count}", String(selectedCount))}
        </button>
      ) : (
        <a className={exportClass} download href={exportHref}>
          <HiOutlineArrowDownTray aria-hidden="true" className="size-4" />
          {labels.exportLabel}
        </a>
      )}
    </section>
  );
}

function PeriodMenu({
  labels,
  state,
  locale,
  timeZone,
  now,
  onStateChange,
}: {
  readonly labels: TransactionUiLabels;
  readonly state: TransactionListState;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly onStateChange: StateChange;
}) {
  const [range, setRange] = useState({
    from: state.from ?? "",
    to: state.to ?? "",
  });
  const months = recentMonths(now, timeZone, 12);
  const currentYear = months[0]?.year;
  const monthLabel = (month: CalendarMonth) =>
    new Intl.DateTimeFormat(locale, {
      month: "long",
      ...(month.year === currentYear ? {} : { year: "numeric" }),
      timeZone: "UTC",
    }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
  const activeMonth = months.find(
    (month) => month.from === state.from && month.to === state.to,
  );
  const label = activeMonth
    ? monthLabel(activeMonth)
    : (formatDateRange(state.from, state.to, locale) ?? labels.filterAllTime);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${labels.filterPeriod}: ${label}`}
          className={triggerClass}
          variant="outline">
          <HiOutlineCalendarDays aria-hidden="true" className="size-4" />
          <span className="max-w-40 truncate capitalize">{label}</span>
          <HiOutlineChevronDown
            aria-hidden="true"
            className="size-3.5 text-[#8b98ae]"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(
          menuContentClass,
          "max-h-[min(28rem,70vh)] w-64 overflow-y-auto",
        )}>
        <DropdownMenuItem
          className={cn(
            menuItemClass,
            !state.from && !state.to && menuItemActiveClass,
          )}
          onSelect={() =>
            onStateChange({ from: undefined, to: undefined, page: 1 })
          }>
          {labels.filterAllTime}
        </DropdownMenuItem>
        {months.map((month) => (
          <DropdownMenuItem
            className={cn(
              menuItemClass,
              "capitalize",
              activeMonth?.from === month.from && menuItemActiveClass,
            )}
            key={month.from}
            onSelect={() =>
              onStateChange({ from: month.from, to: month.to, page: 1 })
            }>
            {monthLabel(month)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="my-1 bg-[#edf0f4]" />
        <form
          className="grid gap-2 p-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            onStateChange({
              from: range.from || undefined,
              to: range.to || undefined,
              page: 1,
            });
          }}>
          <p className="text-[11px] font-medium text-[#71809a]">
            {labels.filterCustomRange}
          </p>
          <label className="grid gap-1 text-[11px] font-medium text-[#53627b]">
            {labels.filterFrom}
            <Input
              className="h-9 border-[#e3e8ef] text-[13px] text-[#34405d]"
              max={range.to || undefined}
              onChange={(event) =>
                setRange((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              onKeyDown={(event) => event.stopPropagation()}
              type="date"
              value={range.from}
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-[#53627b]">
            {labels.filterTo}
            <Input
              className="h-9 border-[#e3e8ef] text-[13px] text-[#34405d]"
              min={range.from || undefined}
              onChange={(event) =>
                setRange((current) => ({ ...current, to: event.target.value }))
              }
              onKeyDown={(event) => event.stopPropagation()}
              type="date"
              value={range.to}
            />
          </label>
          <Button
            className="mt-1 h-8 bg-[#2563eb] px-2.5 text-[12px] hover:bg-[#1e55d1]"
            type="submit">
            {labels.filterApply}
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const triggerClass =
  "h-9 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-3 text-[12px] font-medium text-[#34405d] hover:border-[#d5ddea] hover:bg-[#f8fafc] [&_svg:first-child]:text-[#53627b]";

function FilterMenu({
  label,
  icon,
  ariaLabel,
  children,
}: {
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly ariaLabel?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
          className={triggerClass}
          variant="outline">
          {icon}
          <span className="max-w-36 truncate">{label}</span>
          <HiOutlineChevronDown
            aria-hidden="true"
            className="size-3.5 text-[#8b98ae]"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(menuContentClass, "max-h-72 w-56")}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CalendarMonth = {
  readonly year: number;
  readonly month: number;
  readonly from: string;
  readonly to: string;
};

export function recentMonths(
  now: string,
  timeZone: string,
  count: number,
): readonly CalendarMonth[] {
  const [year, month] = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  })
    .format(new Date(now))
    .split("-")
    .map(Number);
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(year!, month! - 1 - offset, 1));
    const monthYear = date.getUTCFullYear();
    const monthNumber = date.getUTCMonth() + 1;
    const prefix = `${monthYear}-${String(monthNumber).padStart(2, "0")}`;
    return {
      year: monthYear,
      month: monthNumber,
      from: `${prefix}-01`,
      to: new Date(Date.UTC(monthYear, monthNumber, 0))
        .toISOString()
        .slice(0, 10),
    };
  });
}

function formatDateRange(
  from: string | undefined,
  to: string | undefined,
  locale: string,
): string | null {
  if (!from && !to) return null;
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const format = (value: string) =>
    formatter.format(new Date(`${value}T00:00:00.000Z`));
  return [from ? format(from) : null, to ? format(to) : null]
    .filter(Boolean)
    .join(" – ");
}
