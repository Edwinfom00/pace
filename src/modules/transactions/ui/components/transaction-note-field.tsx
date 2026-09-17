"use client";

import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";

export type TransactionNoteFieldProps = {
  readonly label: string;
  readonly optionalLabel: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
};

export function TransactionNoteField({
  label,
  onValueChange,
  optionalLabel,
  placeholder,
  value,
}: TransactionNoteFieldProps) {
  const id = useId();

  return (
    <div className="grid gap-2">
      <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor={id}>
        <span>{label}</span>
        <span className="text-[12px] font-normal text-[#71809a]">{optionalLabel}</span>
      </label>
      <Textarea
        autoCapitalize="sentences"
        className="min-h-[72px] max-h-32 resize-y rounded-[8px] border-[#d9e1ec] bg-white px-3 py-2.5 text-[13px] leading-5 text-[#13213f] placeholder:text-[#71809a] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
        id={id}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        rows={3}
        value={value}
      />
    </div>
  );
}
