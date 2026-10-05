"use client";

import { HiOutlineChevronRight } from "react-icons/hi2";
import type { IconType } from "react-icons";

import { cn } from "@/lib/utils";

type SuggestionProps = {
  readonly label: string;
  readonly icon?: IconType;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
};

export function AssistantSuggestionRow({ label, icon: Icon, disabled, onSelect }: SuggestionProps) {
  return (
    <button
      className="group flex min-h-10 w-full items-center gap-2.5 rounded-[9px] border border-[#e5e9f0] bg-white px-3 py-2 text-left text-[13px] font-medium text-[#34405d] transition-colors hover:border-[#b9cffd] hover:bg-[#f8faff] hover:text-[#18213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {Icon ? <Icon aria-hidden className="size-4 shrink-0 text-[#6b7a94] group-hover:text-[#2f6fed]" /> : null}
      <span className="min-w-0 flex-1">{label}</span>
      <HiOutlineChevronRight aria-hidden className="size-3.5 shrink-0 text-[#a4afbf] group-hover:text-[#2f6fed]" />
    </button>
  );
}

export function AssistantSuggestionChip({
  label,
  disabled,
  onSelect,
  className,
}: SuggestionProps & { readonly className?: string }) {
  return (
    <button
      className={cn(
        "h-8 shrink-0 rounded-full border border-[#e2e7ef] bg-white px-3 text-[12px] font-medium whitespace-nowrap text-[#536079] transition-colors hover:border-[#b9cffd] hover:bg-[#f6f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  );
}
