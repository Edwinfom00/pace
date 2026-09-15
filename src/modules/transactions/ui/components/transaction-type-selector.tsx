"use client";

import { useRef, type KeyboardEvent } from "react";
import { FiArrowDown, FiArrowUpRight, FiRepeat } from "react-icons/fi";
import { cn } from "cn";

export const transactionFormKinds = ["EXPENSE", "INCOME", "TRANSFER"] as const;

export type TransactionFormKind = (typeof transactionFormKinds)[number];

export const transactionFormKindLabels: Readonly<Record<TransactionFormKind, string>> = {
  EXPENSE: "Expense",
  INCOME: "Income",
  TRANSFER: "Transfer",
};

const transactionTypeOptions = [
  {
    value: "EXPENSE",
    label: transactionFormKindLabels.EXPENSE,
    icon: FiArrowDown,
    selectedClassName: "bg-[#fff6f7] text-[#b42336] shadow-[inset_0_0_0_1px_#f3b9c0]",
  },
  {
    value: "INCOME",
    label: transactionFormKindLabels.INCOME,
    icon: FiArrowUpRight,
    selectedClassName: "bg-[#f2fbf5] text-[#087443] shadow-[inset_0_0_0_1px_#a7dfbd]",
  },
  {
    value: "TRANSFER",
    label: transactionFormKindLabels.TRANSFER,
    icon: FiRepeat,
    selectedClassName: "bg-[#f3f7ff] text-[#245ecf] shadow-[inset_0_0_0_1px_#b8cdf7]",
  },
] as const satisfies ReadonlyArray<{
  value: TransactionFormKind;
  label: string;
  icon: typeof FiArrowDown;
  selectedClassName: string;
}>;

export function TransactionTypeSelector({
  value,
  onValueChange,
}: {
  readonly value: TransactionFormKind;
  readonly onValueChange: (value: TransactionFormKind) => void;
}) {
  const optionRefs = useRef<Partial<Record<TransactionFormKind, HTMLButtonElement | null>>>({});

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = transactionFormKinds.indexOf(value);
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % transactionFormKinds.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + transactionFormKinds.length) % transactionFormKinds.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = transactionFormKinds.length - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    const nextValue = transactionFormKinds[nextIndex];
    onValueChange(nextValue);
    requestAnimationFrame(() => optionRefs.current[nextValue]?.focus());
  }

  return (
    <div
      aria-label="Transaction type"
      aria-orientation="horizontal"
      className="grid grid-cols-3 divide-x divide-[#e4e9f1] overflow-hidden rounded-[10px] border border-[#e1e7f0] bg-[#fbfcfe] p-1"
      onKeyDown={handleKeyDown}
      role="radiogroup"
    >
      {transactionTypeOptions.map((option) => {
        const Icon = option.icon;
        const selected = option.value === value;

        return (
          <button
            aria-checked={selected}
            className={cn(
              "relative flex h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] px-1.5 text-[11px] font-medium whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-150 sm:h-12 sm:gap-2 sm:px-3 sm:text-[13px]",
              "text-[#53627b] hover:bg-white hover:text-[#263550] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[#5e8fe8] focus-visible:ring-inset",
              selected && cn("font-semibold", option.selectedClassName),
            )}
            key={option.value}
            onClick={() => onValueChange(option.value)}
            ref={(element) => {
              optionRefs.current[option.value] = element;
            }}
            role="radio"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-[18px]" />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
