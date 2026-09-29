"use client";

import { FiMessageCircle } from "react-icons/fi";

import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";

export function PlansAskPaceButton({
  label,
  language,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly label: string;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  return (
    <PaceAssistantLauncher language={language} locale={locale} pageContext={{ page: "plans" }} timeZone={timeZone} workspaceId={workspaceId}>
      {({ openPaceAssistant }) => (
        <button className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#dfe5ee] px-3 text-[13px] font-medium text-[#33425d] hover:bg-[#f8faff]" onClick={() => openPaceAssistant()} type="button">
          <FiMessageCircle className="size-4 text-[#2867e8]" />
          {label}
        </button>
      )}
    </PaceAssistantLauncher>
  );
}
