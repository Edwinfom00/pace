"use client";

import { useRef } from "react";
import {
  FiBookOpen,
  FiCheck,
  FiCoffee,
  FiFileText,
  FiFilm,
  FiHeart,
  FiHome,
  FiMapPin,
  FiMoreHorizontal,
  FiRepeat,
  FiShoppingBag,
  FiTruck,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { cn } from "cn";

export const BUDGET_ICON_KEYS = [
  "food",
  "transport",
  "shopping",
  "home",
  "health",
  "entertainment",
  "subscriptions",
  "bills",
  "education",
  "travel",
  "other",
] as const;

export type BudgetIconKey = (typeof BUDGET_ICON_KEYS)[number];

export const BUDGET_ACCENT_KEYS = [
  "coral",
  "blue",
  "violet",
  "amber",
  "rose",
  "indigo",
] as const;

export type BudgetAccentKey = (typeof BUDGET_ACCENT_KEYS)[number];

export type BudgetVisualIdentity = {
  readonly iconKey: BudgetIconKey;
  readonly accentKey: BudgetAccentKey;
};

type BudgetIconOption = {
  readonly iconKey: BudgetIconKey;
  readonly accentKey: BudgetAccentKey;
  readonly Icon: IconType;
};

export const BUDGET_ICON_OPTIONS: readonly BudgetIconOption[] = [
  { iconKey: "food", accentKey: "coral", Icon: FiCoffee },
  {
    iconKey: "transport",
    accentKey: "blue",
    Icon: FiTruck,
  },
  {
    iconKey: "shopping",
    accentKey: "violet",
    Icon: FiShoppingBag,
  },
  { iconKey: "home", accentKey: "amber", Icon: FiHome },
  { iconKey: "health", accentKey: "rose", Icon: FiHeart },
  {
    iconKey: "entertainment",
    accentKey: "indigo",
    Icon: FiFilm,
  },
  {
    iconKey: "subscriptions",
    accentKey: "violet",
    Icon: FiRepeat,
  },
  { iconKey: "bills", accentKey: "blue", Icon: FiFileText },
  {
    iconKey: "education",
    accentKey: "amber",
    Icon: FiBookOpen,
  },
  { iconKey: "travel", accentKey: "blue", Icon: FiMapPin },
  {
    iconKey: "other",
    accentKey: "indigo",
    Icon: FiMoreHorizontal,
  },
];

export const DEFAULT_BUDGET_VISUAL_IDENTITY: BudgetVisualIdentity = {
  iconKey: "food",
  accentKey: "coral",
};

export type BudgetIconPickerLabels = Readonly<{
  groupLabel: string;
  icons: Readonly<Record<BudgetIconKey, string>>;
}>;

const accentStyles: Record<
  BudgetAccentKey,
  { background: string; foreground: string }
> = {
  coral: { background: "#fff0eb", foreground: "#ff6b35" },
  blue: { background: "#edf4ff", foreground: "#2867e8" },
  violet: { background: "#f1efff", foreground: "#7057d9" },
  amber: { background: "#fff5e6", foreground: "#e58b16" },
  rose: { background: "#fff0f3", foreground: "#e85d75" },
  indigo: { background: "#eef0ff", foreground: "#5864d9" },
};

export function selectBudgetIcon(iconKey: BudgetIconKey): BudgetVisualIdentity {
  const option = BUDGET_ICON_OPTIONS.find(
    (candidate) => candidate.iconKey === iconKey,
  );
  if (!option) return DEFAULT_BUDGET_VISUAL_IDENTITY;
  return { iconKey: option.iconKey, accentKey: option.accentKey };
}

export function BudgetIconPicker({
  labels,
  value,
  onChange,
}: {
  readonly labels: BudgetIconPickerLabels;
  readonly value: BudgetVisualIdentity;
  readonly onChange: (value: BudgetVisualIdentity) => void;
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveFocus = (currentIndex: number, direction: -1 | 1) => {
    const nextIndex =
      (currentIndex + direction + BUDGET_ICON_OPTIONS.length) %
      BUDGET_ICON_OPTIONS.length;
    const next = BUDGET_ICON_OPTIONS[nextIndex];
    if (!next) return;
    onChange(selectBudgetIcon(next.iconKey));
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      aria-label={labels.groupLabel}
      className="flex flex-wrap gap-2"
      role="radiogroup">
      {BUDGET_ICON_OPTIONS.map(({ iconKey, accentKey, Icon }, index) => {
        const selected = value.iconKey === iconKey;
        const accent = accentStyles[selected ? value.accentKey : accentKey];
        return (
          <button
            aria-checked={selected}
            aria-label={labels.icons[iconKey]}
            className={cn(
              "relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-[8px] border text-[16px] transition-[border-color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-[#2867e8] focus-visible:ring-offset-2",
              selected
                ? "border-[#2867e8] shadow-[inset_0_0_0_1px_#2867e8]"
                : "border-transparent hover:border-[#c9d8f3]",
            )}
            key={iconKey}
            onClick={() => onChange(selectBudgetIcon(iconKey))}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(index, 1);
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus(index, -1);
              }
            }}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            role="radio"
            style={{
              backgroundColor: accent.background,
              color: accent.foreground,
            }}
            tabIndex={selected ? 0 : -1}
            type="button">
            <Icon aria-hidden="true" className="size-4" />
            {selected ? (
              <span className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full border border-white bg-[#2867e8] text-white">
                <FiCheck aria-hidden="true" className="size-2.5 stroke-3" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function BudgetVisualIcon({
  ariaLabel,
  value,
}: {
  readonly ariaLabel: string;
  readonly value: BudgetVisualIdentity;
}) {
  const option =
    BUDGET_ICON_OPTIONS.find(
      (candidate) => candidate.iconKey === value.iconKey,
    ) ?? BUDGET_ICON_OPTIONS[0]!;
  const accent = accentStyles[value.accentKey];
  const Icon = option.Icon;
  return (
    <span
      aria-label={ariaLabel}
      className="grid size-11 place-items-center rounded-[9px]"
      role="img"
      style={{ backgroundColor: accent.background, color: accent.foreground }}>
      <Icon aria-hidden="true" className="size-5" />
    </span>
  );
}
