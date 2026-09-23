"use client";

import { HiOutlineChevronDown } from "react-icons/hi2";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";

import type { InboxOverviewSort } from "../../inbox-overview";

const SORT_VALUES: readonly InboxOverviewSort[] = ["NEWEST", "OLDEST"];


export function InboxSortFilter({
  labels,
  value,
  onValueChange,
  disabled = false,
}: {
  readonly labels: DashboardLabels;
  readonly value: InboxOverviewSort;
  readonly onValueChange: (value: InboxOverviewSort) => void;
  readonly disabled?: boolean;
}) {
  const sortLabel = (sort: InboxOverviewSort) => (
    sort === "NEWEST" ? labels["inbox.sort.newest"] : labels["inbox.sort.oldest"]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${labels["inbox.sort.label"]}: ${sortLabel(value)}`}
          className="inline-flex h-8 max-w-full items-center gap-1 rounded-[7px] border border-transparent px-2 text-[12px] font-medium text-[#667895] outline-none transition-[background-color,border-color,color] duration-150 hover:border-[#e3e8f0] hover:bg-[#f8fafc] hover:text-[#43536e] focus-visible:border-[#b9d0fb] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-[#dce9ff] disabled:cursor-wait disabled:opacity-60"
          disabled={disabled}
          type="button"
        >
          <span className="truncate">{sortLabel(value)}</span>
          <HiOutlineChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-[#7183a0]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[9px] border border-[#e4e9f1] bg-white p-1 shadow-[0_5px_14px_rgb(16_24_40/10%)]">
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => {
            if (nextValue === "NEWEST" || nextValue === "OLDEST") onValueChange(nextValue);
          }}
          value={value}
        >
          {SORT_VALUES.map((sort) => {
            const selected = sort === value;
            return (
              <DropdownMenuRadioItem
                className={cn(
                  "rounded-[6px] px-2.5 py-2 text-[13px] text-[#53627b] focus:bg-[#f3f6fa] focus:text-[#243552]",
                  selected && "bg-[#f3f6fa] font-medium text-[#1b2844]",
                )}
                key={sort}
                value={sort}
              >
                {sort === "NEWEST" ? labels["inbox.sort.option.newest"] : labels["inbox.sort.option.oldest"]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
