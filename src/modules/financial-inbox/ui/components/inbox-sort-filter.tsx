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

import {
  INBOX_OVERVIEW_SORTS,
  type InboxOverviewSort,
} from "../../inbox-overview";

const SORT_LABEL_KEYS: Record<
  InboxOverviewSort,
  {
    readonly value: keyof DashboardLabels;
    readonly option: keyof DashboardLabels;
  }
> = {
  NEWEST: {
    value: "inbox.sort.value.newest",
    option: "inbox.sort.option.newest",
  },
  OLDEST: {
    value: "inbox.sort.value.oldest",
    option: "inbox.sort.option.oldest",
  },
  LARGEST: {
    value: "inbox.sort.value.largest",
    option: "inbox.sort.option.largest",
  },
};

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
  const valueLabel = labels[SORT_LABEL_KEYS[value].value];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${labels["inbox.sort.label"]}: ${valueLabel}`}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[7px] px-2 text-[12px] text-[#71809a] outline-none transition-colors duration-150 hover:bg-[#f5f7fa] focus-visible:ring-2 focus-visible:ring-[#dce9ff] disabled:cursor-wait disabled:opacity-60"
          disabled={disabled}
          type="button">
          <span className="truncate">
            {labels["inbox.sort.prefix"]}{" "}
            <span className="font-medium text-[#22314b]">{valueLabel}</span>
          </span>
          <HiOutlineChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-[#22314b]"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 rounded-[9px] border border-[#e4e9f1] bg-white p-1 shadow-[0_5px_14px_rgb(16_24_40/10%)]">
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => {
            const next = INBOX_OVERVIEW_SORTS.find(
              (sort) => sort === nextValue,
            );
            if (next) onValueChange(next);
          }}
          value={value}>
          {INBOX_OVERVIEW_SORTS.map((sort) => (
            <DropdownMenuRadioItem
              className={cn(
                "rounded-[6px] px-2.5 py-2 text-[13px] text-[#53627b] focus:bg-[#f3f6fa] focus:text-[#243552]",
                sort === value && "bg-[#f3f6fa] font-medium text-[#1b2844]",
              )}
              key={sort}
              value={sort}>
              {labels[SORT_LABEL_KEYS[sort].option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
