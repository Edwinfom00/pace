"use client";

import { useEffect, useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineChevronDown,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  DEFAULT_TRANSACTION_FILTER_STATE,
  hasActiveTransactionFilters,
} from "../../domain/transaction-list-url";
import type {
  TransactionFilterKind,
  TransactionFilterOptions,
  TransactionFilterState,
} from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

const filterKinds: readonly TransactionFilterKind[] = ["ALL", "EXPENSE", "INCOME", "TRANSFER", "REFUND"];

export function TransactionFilterBar({
  labels,
  state,
  options,
  locale,
  onStateChange,
}: {
  readonly labels: TransactionUiLabels;
  readonly state: TransactionFilterState & { readonly page: number };
  readonly options: TransactionFilterOptions;
  readonly locale: string;
  readonly onStateChange: (next: Partial<TransactionFilterState & { readonly page: number }>, replace?: boolean) => void;
}) {
  const [search, setSearch] = useState(state.search);
  const [range, setRange] = useState({ from: state.from ?? "", to: state.to ?? "" });
  const kindLabel: Record<TransactionFilterKind, string> = {
    ALL: labels.filterAll,
    EXPENSE: labels.filterExpense,
    INCOME: labels.filterIncome,
    TRANSFER: labels.filterTransfer,
    REFUND: labels.filterRefund,
  };
  const selectedCategory = options.categories.find((option) => option.id === state.categoryId);
  const selectedAccount = options.accounts.find((option) => option.id === state.accountId);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized === state.search) return;
    const timer = window.setTimeout(() => onStateChange({ page: 1, search: normalized }, true), 320);
    return () => window.clearTimeout(timer);
  }, [onStateChange, search, state.search]);

  return (
    <div className="space-y-2.5">
      <label className="relative block max-w-[420px]">
        <span className="sr-only">{labels.searchLabel}</span>
        <HiOutlineMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#7b879e]" />
        <Input
          className="h-9 border-[#e3e8ef] bg-white pr-3 pl-9 text-[13px] text-[#34405d] placeholder:text-[#66758d] focus-visible:border-[#93b4f8] focus-visible:ring-2 focus-visible:ring-[#dce9ff]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          value={search}
        />
      </label>
      <div aria-label={labels.filtersLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <FilterMenu ariaLabel={`${labels.filtersLabel}: ${kindLabel[state.kind]}`} label={kindLabel[state.kind]} leading={<HiOutlineFunnel aria-hidden="true" className="size-3.5" />}>
          {filterKinds.map((kind) => (
            <DropdownMenuItem
              className={cn("rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]", state.kind === kind && "bg-[#f3f6fa] font-medium text-[#1b2844]")}
              key={kind}
              onSelect={() => onStateChange({ kind, page: 1 })}
            >
              {kindLabel[kind]}
            </DropdownMenuItem>
          ))}
        </FilterMenu>
        <FilterMenu ariaLabel={`${labels.filterCategory}: ${selectedCategory?.label ?? labels.filterAllCategories}`} label={selectedCategory?.label ?? labels.filterCategory}>
          <DropdownMenuItem className="rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]" onSelect={() => onStateChange({ categoryId: undefined, page: 1 })}>
            {labels.filterAllCategories}
          </DropdownMenuItem>
          {options.categories.map((category) => (
            <DropdownMenuItem
              className={cn("rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]", state.categoryId === category.id && "bg-[#f3f6fa] font-medium text-[#1b2844]")}
              key={category.id}
              onSelect={() => onStateChange({ categoryId: category.id, page: 1 })}
            >
              {category.label}
            </DropdownMenuItem>
          ))}
        </FilterMenu>
        <FilterMenu ariaLabel={`${labels.filterAccount}: ${selectedAccount?.label ?? labels.filterAllAccounts}`} label={selectedAccount?.label ?? labels.filterAccount}>
          <DropdownMenuItem className="rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]" onSelect={() => onStateChange({ accountId: undefined, page: 1 })}>
            {labels.filterAllAccounts}
          </DropdownMenuItem>
          {options.accounts.map((account) => (
            <DropdownMenuItem
              className={cn("rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]", state.accountId === account.id && "bg-[#f3f6fa] font-medium text-[#1b2844]")}
              key={account.id}
              onSelect={() => onStateChange({ accountId: account.id, page: 1 })}
            >
              {account.label}
            </DropdownMenuItem>
          ))}
        </FilterMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`${labels.filterDate}: ${formatDateRange(state.from, state.to, locale) ?? labels.filterDate}`} className="h-8 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]" variant="outline">
              <HiOutlineCalendarDays aria-hidden="true" className="size-3.5" />
              {formatDateRange(state.from, state.to, locale) ?? labels.filterDate}
              <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#8b98ae]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(21rem,calc(100vw-2rem))] rounded-[10px] border border-[#e7ebf1] bg-white p-2 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onStateChange({ from: range.from || undefined, to: range.to || undefined, page: 1 });
              }}
            >
              <label className="grid gap-1 text-[11px] font-medium text-[#53627b]">
                {labels.filterFrom}
                <Input className="h-9 border-[#e3e8ef] text-[13px] text-[#34405d]" max={range.to || undefined} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} type="date" value={range.from} />
              </label>
              <label className="grid gap-1 text-[11px] font-medium text-[#53627b]">
                {labels.filterTo}
                <Input className="h-9 border-[#e3e8ef] text-[13px] text-[#34405d]" min={range.from || undefined} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} type="date" value={range.to} />
              </label>
              <div className="mt-1 flex items-center justify-between gap-2">
                <Button className="h-8 px-2.5 text-[12px]" onClick={() => { setRange({ from: "", to: "" }); onStateChange({ from: undefined, to: undefined, page: 1 }); }} type="button" variant="ghost">
                  {labels.filterClear}
                </Button>
                <Button className="h-8 bg-[#2563eb] px-2.5 text-[12px] hover:bg-[#1e55d1]" type="submit">
                  {labels.filterApply}
                </Button>
              </div>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
        {hasActiveTransactionFilters(state) ? (
          <Button aria-label={labels.filterClear} className="h-8 shrink-0 rounded-[8px] px-2 text-[12px] text-[#53627b] hover:bg-[#f3f6fa] hover:text-[#34405d]" onClick={() => onStateChange({ ...DEFAULT_TRANSACTION_FILTER_STATE, accountId: undefined, categoryId: undefined, from: undefined, page: 1, to: undefined })} type="button" variant="ghost">
            <HiOutlineXMark aria-hidden="true" className="size-3.5" />
            {labels.filterClear}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  children,
  leading,
  ariaLabel,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly leading?: React.ReactNode;
  readonly ariaLabel: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={ariaLabel} className="h-8 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]" variant="outline">
          {leading}
          <span className="max-w-32 truncate">{label}</span>
          <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#8b98ae]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-52 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDateRange(from: string | undefined, to: string | undefined, locale: string): string | null {
  if (!from && !to) return null;
  const formatter = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const format = (value: string) => formatter.format(new Date(`${value}T00:00:00.000Z`));
  return [from ? format(from) : null, to ? format(to) : null].filter(Boolean).join(" – ");
}
