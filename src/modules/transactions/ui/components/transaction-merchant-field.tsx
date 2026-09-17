"use client";

import { useId, type RefObject } from "react";
import { FiShoppingBag } from "react-icons/fi";

export type TransactionMerchantFieldProps = {
  readonly error?: string;
  readonly helperText: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly inputRef?: RefObject<HTMLInputElement | null>;
  readonly value: string;
};

export function TransactionMerchantField({
  error,
  helperText,
  label,
  onValueChange,
  placeholder,
  inputRef,
  value,
}: TransactionMerchantFieldProps) {
  const inputId = useId();
  const helperId = useId();
  const errorId = useId();

  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={inputId}>
        {label}
      </label>

      <div className={`flex h-11 items-center gap-2.5 rounded-[8px] border bg-white px-3 text-[#53627b] transition-[border-color,box-shadow] duration-150 focus-within:ring-3 ${error ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
        <FiShoppingBag aria-hidden="true" className="size-4.25 shrink-0 text-[#526987]" />
        <input
          aria-describedby={error ? errorId : helperId}
          aria-invalid={error ? true : undefined}
          autoComplete="organization"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#13213f] outline-none placeholder:text-[#8a9ab3]"
          id={inputId}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          ref={inputRef}
          type="text"
          value={value}
        />
      </div>

      <p className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`} id={error ? errorId : helperId}>
        {error ?? helperText}
      </p>
    </div>
  );
}
