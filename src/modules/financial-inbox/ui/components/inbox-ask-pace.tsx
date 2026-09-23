"use client";

import { FiMessageCircle } from "react-icons/fi";

import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";


export function InboxAskPace({
  workspaceId,
  language,
  locale,
  timeZone,
}: {
  readonly workspaceId: string;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const labels = getPaceAssistantLabels(language);

  return (
    <PaceAssistantLauncher
      language={language}
      locale={locale}
      pageContext={{ page: "inbox" }}
      timeZone={timeZone}
      workspaceId={workspaceId}
    >
      {({ openPaceAssistant }) => (
        <button
          aria-label={labels.ask}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[8px] border border-[#dfe5ee] bg-white px-2.5 text-[12px] font-medium whitespace-nowrap text-[#43516a] transition-colors hover:border-[#b8d0ff] hover:bg-[#f8faff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] max-sm:size-11 max-sm:justify-center max-sm:px-0 sm:h-9 sm:min-h-0 sm:gap-2 sm:px-3"
          onClick={() => openPaceAssistant()}
          type="button"
        >
          <FiMessageCircle aria-hidden="true" className="size-3.5 text-[#2f6fed]" />
          <span className="max-sm:sr-only">{labels.ask}</span>
        </button>
      )}
    </PaceAssistantLauncher>
  );
}
