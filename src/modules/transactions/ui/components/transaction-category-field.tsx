"use client";

import { useId, type RefObject } from "react";
import { FiX } from "react-icons/fi";

import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { LedgerCategoryKind } from "@/modules/ledger/domain";
import {
  getCompatibleTransactionCategoryOptions,
  type TransactionCategoryOption,
} from "@/modules/transactions/domain/transaction-category-options";

export type TransactionCategoryFieldProps = {
  readonly availability: "loading" | "ready" | "error";
  readonly categories: readonly TransactionCategoryOption[];
  readonly categoryEmptyLabel: string;
  readonly categoryLoadError: string;
  readonly categoryLoadingLabel: string;
  readonly categoryRetryLabel: string;
  /** Optional explicit uncategorize affordance for detail editing. */
  readonly clearLabel?: string;
  readonly error?: string;
  readonly helperText: string;
  readonly kind: LedgerCategoryKind;
  readonly label: string;
  readonly onRetryCategories?: () => void;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly value: string;
};


export function TransactionCategoryField({
  availability,
  categories,
  categoryEmptyLabel,
  categoryLoadError,
  categoryLoadingLabel,
  categoryRetryLabel,
  clearLabel,
  error,
  helperText,
  kind,
  label,
  onRetryCategories,
  onValueChange,
  placeholder,
  searchPlaceholder,
  triggerRef,
  value,
}: TransactionCategoryFieldProps) {
  const triggerId = useId();
  const helperId = useId();
  const errorId = useId();
  const eligibleCategories = getCompatibleTransactionCategoryOptions(categories, kind);
  const options = eligibleCategories.map(
    (category): SelectOption => ({
      value: category.id,
      label: category.name,
      icon: (
        <TransactionIcon
          categoryKey={category.systemKey}
          categoryName={category.name}
          decorative
          size="sm"
          transactionKind={category.kind}
        />
      ),
    }),
  );
  const describedBy = error ? errorId : helperId;

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={triggerId}>
        {label}
      </label>

      {availability === "loading" ? (
        <button
          aria-busy="true"
          aria-describedby={helperId}
          className="flex h-11 w-full items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-left text-[13px] text-[#71809a]"
          disabled
          id={triggerId}
          type="button"
        >
          <span className="h-4 w-32 animate-pulse rounded bg-[#e7edf6] motion-reduce:animate-none" />
          <span className="sr-only">{categoryLoadingLabel}</span>
        </button>
      ) : availability === "error" ? (
        <div
          aria-describedby={helperId}
          className="flex min-h-11 items-center justify-between gap-2 rounded-[8px] border border-[#f1c7cd] bg-[#fff8f8] px-3 py-1.5"
          id={triggerId}
          role="status"
        >
          <span className="min-w-0 text-[12px] leading-4 text-[#a84653]">{categoryLoadError}</span>
          {onRetryCategories ? (
            <button
              className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium text-[#2f67e9] outline-none hover:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
              onClick={onRetryCategories}
              type="button"
            >
              {categoryRetryLabel}
            </button>
          ) : null}
        </div>
      ) : eligibleCategories.length === 0 ? (
        <div
          aria-describedby={helperId}
          className="flex h-11 w-full items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-[13px] text-[#71809a]"
          id={triggerId}
          role="status"
        >
          {categoryEmptyLabel}
        </div>
      ) : (
        <PaceSearchSelect
          ariaLabel={label}
          describedBy={describedBy}
          id={triggerId}
          invalid={Boolean(error)}
          onValueChange={onValueChange}
          options={options}
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
          triggerRef={triggerRef}
          value={value}
        />
      )}

      {availability === "ready" && value && clearLabel ? (
        <button
          className="-mt-0.5 flex h-7 w-fit items-center gap-1 rounded-[6px] px-1.5 text-[12px] font-medium text-[#526987] outline-none transition-colors hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:bg-[#edf3ff] focus-visible:ring-2 focus-visible:ring-[#5e8fe8]/30"
          onClick={() => onValueChange("")}
          type="button"
        >
          <FiX aria-hidden="true" className="size-3.5" />
          {clearLabel}
        </button>
      ) : null}

      <p
        className={error ? "min-h-5 text-[12px] leading-5 text-[#c23445]" : "min-h-5 text-[12px] leading-5 text-[#71809a]"}
        id={describedBy}
      >
        {error ?? helperText}
      </p>
    </div>
  );
}
