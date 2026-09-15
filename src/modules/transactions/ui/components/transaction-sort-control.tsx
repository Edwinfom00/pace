"use client";

import { HiOutlineArrowsUpDown, HiOutlineChevronDown } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { TransactionSortValue } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

const sortValues: readonly TransactionSortValue[] = ["NEWEST", "OLDEST", "HIGHEST", "LOWEST"];

export function TransactionSortControl({
  labels,
  value,
  onValueChange,
  amountSortingAvailable = true,
}: {
  readonly labels: TransactionUiLabels;
  readonly value: TransactionSortValue;
  readonly onValueChange?: (value: TransactionSortValue) => void;
  readonly amountSortingAvailable?: boolean;
}) {
  const selected = value;
  const sortLabel: Record<TransactionSortValue, string> = {
    NEWEST: labels.sortNewest,
    OLDEST: labels.sortOldest,
    HIGHEST: labels.sortHighest,
    LOWEST: labels.sortLowest,
  };

  const selectValue = (next: TransactionSortValue) => {
    onValueChange?.(next);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={labels.sortLabel} className="h-9 shrink-0 rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:border-[#d5ddea] hover:bg-[#f8fafc]" variant="outline">
          <HiOutlineArrowsUpDown aria-hidden="true" className="size-3.5" />
          <span className="hidden sm:inline">{sortLabel[selected]}</span>
          <span className="sm:hidden">{labels.sortLabel}</span>
          <HiOutlineChevronDown aria-hidden="true" className="size-3.5 text-[#8b98ae]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
        {sortValues.map((sort) => (
          <DropdownMenuItem
            className={cn("rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]", selected === sort && "bg-[#f3f6fa] font-medium text-[#1b2844]")}
            key={sort}
            onSelect={() => selectValue(sort)}
            disabled={!amountSortingAvailable && (sort === "HIGHEST" || sort === "LOWEST")}
            title={!amountSortingAvailable && (sort === "HIGHEST" || sort === "LOWEST") ? labels.sortAmountUnavailable : undefined}
          >
            {sortLabel[sort]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
