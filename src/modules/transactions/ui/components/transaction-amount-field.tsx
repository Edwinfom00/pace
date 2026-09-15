"use client";

import { useId } from "react";

import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import { TransactionCurrencySelector } from "./transaction-currency-selector";

export type TransactionAmountFieldProps = {
  readonly currency: string;
  readonly currencyEmptyLabel: string;
  readonly currencyLabel: string;
  readonly currencySearchPlaceholder: string;
  readonly error?: string;
  readonly helperText?: string;
  readonly label: string;
  readonly language: OnboardingLanguage;
  readonly onCurrencyChange: (currency: string) => void;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
};

export function TransactionAmountField({
  currency,
  currencyEmptyLabel,
  currencyLabel,
  currencySearchPlaceholder,
  error,
  helperText,
  label,
  language,
  onCurrencyChange,
  onValueChange,
  value,
}: TransactionAmountFieldProps) {
  const inputId = useId();
  const descriptionId = useId();
  const message = error ?? helperText;

  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={inputId}>
        {label}
      </label>

      <div className="flex h-[78px] min-w-0 items-stretch overflow-hidden rounded-[10px] border border-[#d9e1ec] bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#4e7fe3] focus-within:ring-3 focus-within:ring-[#5e8fe8]/15">
        <input
          aria-describedby={message ? descriptionId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[28px] leading-none font-medium tracking-[-0.035em] text-[#101a35] outline-none placeholder:text-[#a6b2c6] sm:px-5 sm:text-[30px]"
          id={inputId}
          inputMode="decimal"
          onChange={(event) => onValueChange(event.target.value)}
          pattern="[0-9]*"
          placeholder="0"
          type="text"
          value={value}
        />

        <div className="my-3 w-px shrink-0 bg-[#e2e8f1]" />

        <TransactionCurrencySelector
          ariaLabel={currencyLabel}
          emptyLabel={currencyEmptyLabel}
          language={language}
          onValueChange={onCurrencyChange}
          searchPlaceholder={currencySearchPlaceholder}
          value={currency}
        />
      </div>

      <p className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`} id={descriptionId}>
        {message}
      </p>
    </div>
  );
}
