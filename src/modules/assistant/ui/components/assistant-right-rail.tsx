"use client";

import type { ReactNode } from "react";
import {
  HiOutlineBanknotes,
  HiOutlineCalendarDays,
  HiOutlineChartPie,
  HiOutlineInbox,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

import type {
  AssistantMessageKey,
  AssistantMessages,
} from "../assistant-messages";
import { useAssistantPrompt } from "../context/assistant-prompt-context";

type QuickQuestion = {
  readonly label: AssistantMessageKey;
  readonly prompt: AssistantMessageKey;
  readonly icon: IconType;
};

export const ASSISTANT_QUICK_QUESTIONS: readonly QuickQuestion[] = [
  {
    label: "rail.quick.spending",
    prompt: "rail.quick.spending.prompt",
    icon: HiOutlineBanknotes,
  },
  {
    label: "rail.quick.upcoming",
    prompt: "rail.quick.upcoming.prompt",
    icon: HiOutlineCalendarDays,
  },
  {
    label: "rail.quick.inbox",
    prompt: "rail.quick.inbox.prompt",
    icon: HiOutlineInbox,
  },
  {
    label: "rail.quick.budget",
    prompt: "rail.quick.budget.prompt",
    icon: HiOutlineChartPie,
  },
];

export function AssistantRightRail({
  messages,
  snapshot,
}: {
  readonly messages: AssistantMessages;
  readonly snapshot: ReactNode;
}) {
  const { ask, disabled } = useAssistantPrompt();

  return (
    <aside
      aria-label={messages["rail.label"]}
      className="hidden w-[320px] shrink-0 divide-y divide-[#edf0f4] overflow-y-auto border-l border-[#e7eaf0] bg-white xl:block 2xl:w-87">
      <section aria-labelledby="assistant-quick-heading" className="px-5 py-5">
        <h2
          className="text-[13px] font-semibold text-[#18233d]"
          id="assistant-quick-heading">
          {messages["rail.quick.title"]}
        </h2>
        <ul className="mt-2 -mx-2">
          {ASSISTANT_QUICK_QUESTIONS.map(({ label, prompt, icon: Icon }) => (
            <li key={label}>
              <button
                className="group flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-left text-[13px] font-medium text-[#34405d] transition-colors hover:bg-[#f4f7fc] hover:text-[#18213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disabled}
                onClick={() => ask(messages[prompt])}
                type="button">
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 text-[#6b7a94] group-hover:text-[#2f6fed]"
                />
                <span className="truncate">{messages[label]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {snapshot}
    </aside>
  );
}
