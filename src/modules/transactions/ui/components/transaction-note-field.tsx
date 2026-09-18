"use client";

import { useId, type RefObject } from "react";

import { Textarea } from "@/components/ui/textarea";

export type TransactionNoteFieldProps = {
  readonly disabled?: boolean;
  readonly error?: string;
  readonly label: string;
  readonly optionalLabel: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly textAreaRef?: RefObject<HTMLTextAreaElement | null>;
  readonly value: string;
};

export function TransactionNoteField({
  disabled = false,
  error,
  label,
  onValueChange,
  optionalLabel,
  placeholder,
  textAreaRef,
  value,
}: TransactionNoteFieldProps) {
  const id = useId();
  const errorId = useId();

  return (
    <div className="grid gap-2">
      <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor={id}>
        <span>{label}</span>
        <span className="text-[12px] font-normal text-[#71809a]">{optionalLabel}</span>
      </label>
      <Textarea
        autoCapitalize="sentences"
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={`min-h-18 max-h-32 resize-y rounded-[8px] bg-white px-3 py-2.5 text-[13px] leading-5 text-[#13213f] placeholder:text-[#71809a] hover:border-[#bac9df] focus-visible:ring-3 ${error ? "border-[#d88690] focus-visible:border-[#c55b68] focus-visible:ring-[#d88690]/15" : "border-[#d9e1ec] focus-visible:border-[#4e7fe3] focus-visible:ring-[#5e8fe8]/15"}`}
        disabled={disabled}
        id={id}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        ref={textAreaRef}
        rows={3}
        value={value}
      />
      {error ? <p className="text-[12px] leading-5 text-[#c23445]" id={errorId}>{error}</p> : null}
    </div>
  );
}
