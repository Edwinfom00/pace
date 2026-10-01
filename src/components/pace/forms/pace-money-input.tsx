"use client";

import { useId, type RefObject } from "react";

export type PaceMoneyInputProps = {
  readonly currency: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly helperText?: string;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly label: string;
  readonly size?: "compact" | "prominent";
  readonly onValueChange: (value: string) => void;
  readonly required?: boolean;
  readonly value: string;
};

export function PaceMoneyInput({
  currency,
  disabled = false,
  error,
  helperText,
  inputRef,
  label,
  size = "prominent",
  onValueChange,
  required = false,
  value,
}: PaceMoneyInputProps) {
  const inputId = useId();
  const messageId = useId();

  return (
    <div className="grid gap-2">
      <label
        className="text-[13px] font-medium text-[#384862]"
        htmlFor={inputId}>
        {label}
        {required ? <span aria-hidden className="ml-0.5 text-[#c23445]">*</span> : null}
      </label>
      <div
        className={`flex min-w-0 items-stretch overflow-hidden border bg-white transition-[border-color,box-shadow] duration-150 ${size === "compact" ? "h-10 rounded-[8px] focus-within:ring-2" : "h-19.5 rounded-[10px] focus-within:ring-3"} ${error ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
        <input
          aria-describedby={error || helperText ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={`min-w-0 flex-1 bg-transparent text-[#101a35] outline-none placeholder:text-[#a6b2c6] disabled:cursor-not-allowed disabled:text-[#61708a] ${size === "compact" ? "px-3 text-[13px] font-medium sm:px-3" : "px-4 py-3 text-[28px] leading-none font-medium tracking-[-0.035em] sm:px-5 sm:text-[30px]"}`}
          disabled={disabled}
          id={inputId}
          inputMode="decimal"
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="0"
          ref={inputRef}
          required={required}
          type="text"
          value={value}
        />
        <span
          aria-label={currency}
          className={`flex shrink-0 items-center justify-center border-l border-[#e2e8f1] text-[13px] font-semibold text-[#263550] ${size === "compact" ? "min-w-20 px-3" : "my-3 min-w-22 px-3 sm:min-w-26 sm:px-4"}`}>
          {currency}
        </span>
      </div>
      <p
        aria-live={error ? "assertive" : undefined}
        className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`}
        id={messageId}
        role={error ? "alert" : undefined}>
        {error ?? helperText}
      </p>
    </div>
  );
}
