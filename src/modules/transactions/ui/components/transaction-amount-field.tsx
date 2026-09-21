"use client";

import { useId, type RefObject } from "react";

import type { CurrencyCode } from "@/money/currency";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import { TransactionCurrencySelector } from "./transaction-currency-selector";

export type TransactionAmountFieldProps = {
  readonly currency: CurrencyCode;
  readonly currencyEmptyLabel: string;
  readonly currencyLabel: string;
  readonly currencySearchPlaceholder: string;
  readonly currencyError?: string;
  readonly currencyDisabled?: boolean;
  readonly inputDisabled?: boolean;
  readonly currencyTriggerRef?: RefObject<HTMLButtonElement | null>;
  readonly error?: string;
  readonly errorDetail?: string;
  readonly helperText?: string;
  readonly label: string;
  readonly language: OnboardingLanguage;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly onCurrencyChange: (currency: CurrencyCode) => void;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
};

export function TransactionAmountField({
  currency,
  currencyEmptyLabel,
  currencyError,
  currencyDisabled = false,
  currencyLabel,
  currencySearchPlaceholder,
  currencyTriggerRef,
  error,
  errorDetail,
  helperText,
  label,
  language,
  inputRef,
  inputDisabled = false,
  onCurrencyChange,
  onValueChange,
  value,
}: TransactionAmountFieldProps) {
  const inputId = useId();
  const helperId = useId();
  const amountErrorId = useId();
  const currencyErrorId = useId();
  const message = error ?? helperText;

  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={inputId}>
        {label}
      </label>

      <div className={`flex h-19.5 min-w-0 items-stretch overflow-hidden rounded-[10px] border bg-white transition-[border-color,box-shadow] duration-150 focus-within:ring-3 ${error || currencyError ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
        <input
          aria-describedby={error ? amountErrorId : helperText ? helperId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[28px] leading-none font-medium tracking-[-0.035em] text-[#101a35] outline-none placeholder:text-[#a6b2c6] disabled:cursor-not-allowed disabled:text-[#61708a] sm:px-5 sm:text-[30px]"
          disabled={inputDisabled}
          id={inputId}
          inputMode="decimal"
          onChange={(event) => onValueChange(event.target.value)}
          pattern="[0-9]*"
          placeholder="0"
          ref={inputRef}
          type="text"
          value={value}
        />

        <div className="my-3 w-px shrink-0 bg-[#e2e8f1]" />

        <TransactionCurrencySelector
          ariaLabel={currencyLabel}
          describedBy={currencyError ? currencyErrorId : undefined}
          disabled={currencyDisabled}
          emptyLabel={currencyEmptyLabel}
          invalid={Boolean(currencyError)}
          language={language}
          onValueChange={onCurrencyChange}
          searchPlaceholder={currencySearchPlaceholder}
          triggerRef={currencyTriggerRef}
          value={currency}
        />
      </div>

      <p
        aria-live={error ? "assertive" : undefined}
        className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`}
        id={error ? amountErrorId : helperId}
        role={error ? "alert" : undefined}
      >
        {message}
        {error && errorDetail ? <span className="mt-0.5 block text-[#9f3543]">{errorDetail}</span> : null}
      </p>
      {currencyError ? <p className="-mt-2 text-[12px] leading-5 text-[#c23445]" id={currencyErrorId}>{currencyError}</p> : null}
    </div>
  );
}
