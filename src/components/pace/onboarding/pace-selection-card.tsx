"use client";

import type { KeyboardEvent } from "react";
import type { IconType } from "react-icons";
import { FiCheck } from "react-icons/fi";

type PaceSelectionCardProps = {
  id: string;
  value: string;
  selected: boolean;
  icon: IconType;
  title: string;
  description: string;
  onSelect: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};


export function PaceSelectionCard({
  id,
  value,
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
  onKeyDown,
}: PaceSelectionCardProps) {
  return (
    <button
      aria-checked={selected}
      className={`relative flex min-h-28 w-full items-center gap-5 rounded-xl border px-6 py-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3268ed]/20 ${
        selected
          ? "border-[#3268ed] bg-[#f4f8ff] shadow-[0_8px_24px_rgba(50,104,237,0.07)]"
          : "border-[#d7e1f0] bg-white hover:border-[#aebfe0] hover:bg-[#fbfdff]"
      }`}
      id={id}
      onClick={() => onSelect(value)}
      onKeyDown={onKeyDown}
      role="radio"
      tabIndex={selected ? 0 : -1}
      type="button"
    >
      <span aria-hidden className={`grid size-16 shrink-0 place-items-center rounded-full ${selected ? "bg-[#e4eeff] text-[#4267b4]" : "bg-[#edf3fc] text-[#4f67a2]"}`}>
        <Icon className="size-8" />
      </span>
      <span className="min-w-0">
        <span className="block text-[19px] font-semibold leading-6 tracking-[-0.03em] text-[#101e3b]">{title}</span>
        <span className="mt-1 block text-base leading-6 text-[#6079b0]">{description}</span>
      </span>
      {selected ? (
        <span aria-label="Selected" className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-[#3268ed] text-white">
          <FiCheck aria-hidden className="size-4" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
