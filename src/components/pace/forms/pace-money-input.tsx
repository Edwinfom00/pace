"use client";

import { useId, type RefObject } from "react";

export type PaceMoneyInputProps = {
  readonly currency: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly helperText?: string;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
};


export function PaceMoneyInput({
  currency,
  disabled = false,
  error,
  helperText,
  inputRef,
  label,
  onValueChange,
  value,
}: PaceMoneyInputProps) {
  const inputId = useId();
  const messageId = useId();

  return (
    <div className="grid gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={inputId}>{label}</label>
      <div className={`flex h-19.5 min-w-0 items-stretch overflow-hidden rounded-[10px] border bg-white transition-[border-color,box-shadow] duration-150 focus-within:ring-3 ${error ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
        <input
          aria-describedby={error || helperText ? messageId : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[28px] leading-none font-medium tracking-[-0.035em] text-[#101a35] outline-none placeholder:text-[#a6b2c6] disabled:cursor-not-allowed disabled:text-[#61708a] sm:px-5 sm:text-[30px]"
          disabled={disabled}
          id={inputId}
          inputMode="decimal"
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="0"
          ref={inputRef}
          type="text"
          value={value}
        />
        <span className="my-3 flex min-w-22 shrink-0 items-center justify-center border-l border-[#e2e8f1] px-3 text-[13px] font-semibold text-[#263550] sm:min-w-26 sm:px-4">
          {currency}
        </span>
      </div>
      <p aria-live={error ? "assertive" : undefined} className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`} id={messageId} role={error ? "alert" : undefined}>
        {error ?? helperText}
      </p>
    </div>
  );
}
