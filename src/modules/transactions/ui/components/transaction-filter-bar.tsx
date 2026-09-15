"use client";

import { useState } from "react";
import { HiOutlineCalendarDays, HiOutlineChevronDown, HiOutlineFunnel, HiOutlineMagnifyingGlass } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { TransactionFilterKind, TransactionFilterState } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

const filterKinds: readonly TransactionFilterKind[] = ["ALL", "EXPENSE", "INCOME", "TRANSFER", "REFUND"];

export function TransactionFilterBar({
  labels,
  value,
  onValueChange,
  searchValue,
  onSearchChange,
}: {
  readonly labels: TransactionUiLabels;
  readonly value?: TransactionFilterState;
  readonly onValueChange?: (value: TransactionFilterState) => void;
  readonly searchValue?: string;
  readonly onSearchChange?: (value: string) => void;
}) {
  const [internalValue, setInternalValue] = useState<TransactionFilterState>({ kind: "ALL" });
  const [internalSearch, setInternalSearch] = useState("");
  const filters = value ?? internalValue;
  const search = searchValue ?? internalSearch;

  const setKind = (kind: TransactionFilterKind) => {
    const next = { ...filters, kind };
    if (value === undefined) setInternalValue(next);
    onValueChange?.(next);
  };
  const setSearch = (next: string) => {
    if (searchValue === undefined) setInternalSearch(next);
    onSearchChange?.(next);
  };

  const kindLabel: Record<TransactionFilterKind, string> = {
    ALL: labels.filterAll,
    EXPENSE: labels.filterExpense,
    INCOME: labels.filterIncome,
    TRANSFER: labels.filterTransfer,
    REFUND: labels.filterRefund,
  };

  return (
    <div className="space-y-2.5">
      <label className="relative block max-w-[420px]">
        <span className="sr-only">{labels.searchLabel}</span>
        <HiOutlineMagnifyingGlass aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#7b879e]" />
        <Input
          className="h-9 border-[#e3e8ef] bg-white pr-3 pl-9 text-[13px] text-[#34405d] placeholder:text-[#8b98ae] focus-visible:border-[#93b4f8] focus-visible:ring-2 focus-visible:ring-[#dce9ff]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          value={search}
        />
      </label>
      <div aria-label={labels.filtersLabel} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]" variant="outline">
              <HiOutlineFunnel aria-hidden="true" className="size-3.5" />
              {kindLabel[filters.kind]}
              <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#8b98ae]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
            {filterKinds.map((kind) => (
              <DropdownMenuItem
                className={cn("rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]", filters.kind === kind && "bg-[#f3f6fa] font-medium text-[#1b2844]")}
                key={kind}
                onSelect={() => setKind(kind)}
              >
                {kindLabel[kind]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TransactionFoundationFilter label={labels.filterCategory} message={labels.filtersAvailableSoon} />
        <TransactionFoundationFilter label={labels.filterAccount} message={labels.filtersAvailableSoon} />
        <TransactionFoundationFilter icon={<HiOutlineCalendarDays aria-hidden="true" className="size-3.5" />} label={labels.filterDate} message={labels.filtersAvailableSoon} />
        <TransactionFoundationFilter label={labels.filterMore} message={labels.filtersAvailableSoon} />
      </div>
    </div>
  );
}

function TransactionFoundationFilter({
  label,
  message,
  icon,
}: {
  readonly label: string;
  readonly message: string;
  readonly icon?: React.ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]" variant="outline">
          {icon}
          {label}
          <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#8b98ae]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
        <DropdownMenuLabel className="px-2.5 py-2 text-[12px] font-normal leading-5 text-[#71809a]">{message}</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
