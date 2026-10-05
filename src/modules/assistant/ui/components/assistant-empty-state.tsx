"use client";

import {
  HiOutlineArrowsRightLeft,
  HiOutlineBanknotes,
  HiOutlineBellAlert,
  HiOutlineCalendarDays,
  HiOutlineChartPie,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

import { PaceLogo } from "@/components/pace/brand/pace-logo";

import type {
  AssistantMessageKey,
  AssistantMessages,
} from "../assistant-messages";
import { AssistantSuggestionRow } from "./assistant-suggestion";

const STARTERS: readonly {
  readonly key: AssistantMessageKey;
  readonly icon: IconType;
}[] = [
  { key: "starters.spending", icon: HiOutlineBanknotes },
  { key: "starters.attention", icon: HiOutlineBellAlert },
  { key: "starters.budget", icon: HiOutlineChartPie },
  { key: "starters.payments", icon: HiOutlineCalendarDays },
  { key: "starters.transactions", icon: HiOutlineArrowsRightLeft },
  { key: "starters.report", icon: HiOutlineDocumentText },
];

export function AssistantEmptyState({
  messages,
  disabled,
  onSelect,
}: {
  readonly messages: AssistantMessages;
  readonly disabled: boolean;
  readonly onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex min-h-full flex-col justify-center py-6">
      <PaceLogo alt="" height={36} variant="icon" width={36} />
      <h2 className="mt-4 text-[22px] leading-7 font-semibold tracking-[-0.03em] text-[#101a35]">
        {messages["empty.greeting"]}
      </h2>
      <p className="mt-1.5 max-w-135 text-[14px] leading-6 text-[#65718a]">
        {messages["empty.description"]}
      </p>
      <h3
        className="mt-6 text-[12px] font-medium text-[#7b859a]"
        id="assistant-starters-heading">
        {messages["starters.label"]}
      </h3>
      <ul
        aria-labelledby="assistant-starters-heading"
        className="mt-2 grid gap-2 sm:grid-cols-2">
        {STARTERS.map(({ key, icon }) => (
          <li key={key}>
            <AssistantSuggestionRow
              disabled={disabled}
              icon={icon}
              label={messages[key]}
              onSelect={() => onSelect(messages[key])}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
