"use client";

import { useRef, type KeyboardEvent } from "react";
import { FiArrowDown, FiArrowUpRight } from "react-icons/fi";

import { cn } from "@/lib/utils";

import { recurringCreateDirections, type RecurringCreateDirection } from "./recurring-create-flow";

export function RecurringTypeSelector({
  disabled = false,
  labels,
  onValueChange,
  value,
}: {
  readonly disabled?: boolean;
  readonly labels: { readonly ariaLabel: string; readonly expense: string; readonly income: string };
  readonly onValueChange: (value: RecurringCreateDirection) => void;
  readonly value: RecurringCreateDirection;
}) {
  const optionRefs = useRef<Partial<Record<RecurringCreateDirection, HTMLButtonElement | null>>>({});
  const options = [
    { value: "EXPENSE" as const, label: labels.expense, icon: FiArrowDown, selected: "bg-[#fff6f7] text-[#b42336] shadow-[inset_0_0_0_1px_#f3b9c0]" },
    { value: "INCOME" as const, label: labels.income, icon: FiArrowUpRight, selected: "bg-[#f2fbf5] text-[#087443] shadow-[inset_0_0_0_1px_#a7dfbd]" },
  ];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = recurringCreateDirections.indexOf(value);
    const nextIndex = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? (index + 1) % recurringCreateDirections.length
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? (index - 1 + recurringCreateDirections.length) % recurringCreateDirections.length
        : event.key === "Home" ? 0 : event.key === "End" ? recurringCreateDirections.length - 1 : null;
    if (disabled || nextIndex === null) return;
    event.preventDefault();
    const next = recurringCreateDirections[nextIndex];
    onValueChange(next);
    requestAnimationFrame(() => optionRefs.current[next]?.focus());
  }

  return (
    <div aria-label={labels.ariaLabel} aria-orientation="horizontal" className="grid grid-cols-2 divide-x divide-[#e4e9f1] overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-[#fbfcfe] p-1" onKeyDown={handleKeyDown} role="radiogroup">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            aria-checked={selected}
            className={cn("relative flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] px-2 text-[12px] font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-150 sm:h-12 sm:text-[13px]", "text-[#53627b] hover:bg-white hover:text-[#263550] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#5e8fe8] focus-visible:ring-inset", selected && cn("font-semibold", option.selected))}
            disabled={disabled}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            ref={(element) => { optionRefs.current[option.value] = element; }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
