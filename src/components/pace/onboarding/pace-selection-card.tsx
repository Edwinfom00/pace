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
  disabled?: boolean;
  badge?: { label: string; tone: "recommended" | "unavailable" | "comingSoon" };
  features?: readonly string[];
  selectedLabel?: string;
  selectionMode?: "single" | "multiple";
  density?: "default" | "compact";
  iconClassName?: string;
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
  disabled = false,
  badge,
  features,
  selectedLabel = "Selected",
  selectionMode = "single",
  density = "default",
  iconClassName,
}: PaceSelectionCardProps) {
  const detailed = Boolean(features?.length);
  const compact = density === "compact";
  const defaultIconTone = disabled
    ? "bg-[#f3f6fb] text-[#9aa9c1]"
    : selected
      ? detailed ? "bg-[#e5efff] text-[#3268ed]" : "bg-[#e4eeff] text-[#4267b4]"
      : "bg-[#edf3fc] text-[#4f67a2]";
  const iconTone = disabled ? defaultIconTone : iconClassName ?? defaultIconTone;
  const badgeTone = badge?.tone === "recommended"
    ? "bg-[#e7f0ff] text-[#2460d8]"
    : badge?.tone === "comingSoon"
      ? "bg-[#fff3df] text-[#c97400]"
      : "bg-[#edf1f7] text-[#627797]";

  return (
    <button
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      className={`relative flex w-full rounded-xl border text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#3268ed]/20 ${
        detailed
          ? "min-h-[226px] flex-col items-stretch px-5 py-5 transition-[border-color,background-color] duration-150 sm:px-6"
          : compact
            ? "min-h-[106px] items-center gap-4 px-3.5 py-3.5 transition-[border-color,background-color] duration-150 sm:px-4"
            : "min-h-28 items-center gap-5 px-6 py-4 transition-[border-color,background-color,box-shadow,transform] duration-150"
      } ${
        disabled
          ? "cursor-not-allowed border-[#dde5f0] bg-[#fbfcfe] text-[#a0adc0]"
          : selected
            ? detailed ? "border-[#3268ed] bg-[#f5f9ff]" : "border-[#3268ed] bg-[#f4f8ff]"
            : "border-[#d7e1f0] bg-white hover:border-[#aebfe0] hover:bg-[#fbfdff]"
      }`}
      disabled={disabled}
      id={id}
      onClick={() => onSelect(value)}
      onKeyDown={onKeyDown}
      role={selectionMode === "multiple" ? "checkbox" : "radio"}
      tabIndex={disabled ? -1 : selectionMode === "multiple" || selected ? 0 : -1}
      type="button"
    >
      <span className={detailed ? "flex min-w-0 items-start gap-4" : "contents"}>
        <span aria-hidden className={`grid shrink-0 place-items-center ${compact ? "size-14 rounded-xl" : "size-16 " + (detailed ? "rounded-2xl" : "rounded-full")} ${iconTone}`}>
          <Icon className={compact ? "size-7" : "size-8"} />
        </span>
        <span className={detailed ? "min-w-0 pt-1" : "min-w-0"}>
          <span className={`block font-semibold tracking-[-0.02em] ${compact ? "text-[15px] leading-5" : "text-[19px] leading-6"} ${disabled ? "text-[#95a4ba]" : "text-[#101e3b]"}`}>{title}</span>
          <span className={`mt-1 block ${compact ? "text-[14px] leading-5" : "text-base leading-6"} ${disabled ? "text-[#9caac0]" : "text-[#6079b0]"}`}>{description}</span>
          {badge ? <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${badgeTone}`}>{badge.label}</span> : null}
        </span>
      </span>
      {selected ? (
        <span aria-label={selectedLabel} className={`absolute grid place-items-center rounded-full bg-[#3268ed] text-white ${compact ? "right-3 top-3 size-5" : "right-4 top-4 size-7"}`}>
          <FiCheck aria-hidden className="size-4" strokeWidth={3} />
        </span>
      ) : null}
      {features?.length ? (
        <ul className={`mt-auto space-y-2.5 pt-5 text-[15px] leading-5 ${disabled ? "text-[#a6b3c7]" : "text-[#344d79]"}`}>
          {features.map((feature) => (
            <li className="flex gap-3" key={feature}>
              <FiCheck aria-hidden className={`mt-0.5 size-4 shrink-0 ${disabled ? "text-[#b4c0d2]" : "text-[#4f70b0]"}`} strokeWidth={2.5} />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </button>
  );
}
