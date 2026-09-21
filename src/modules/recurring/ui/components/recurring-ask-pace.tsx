"use client";

import { FiMessageCircle } from "react-icons/fi";

import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";

/**
 * The assistant has no recurring-specific context or tools yet. Reuse the
 * existing neutral launcher behaviour until the contextual-AI pass lands.
 */
export function RecurringAskPace({
  language,
  locale,
  timeZone,
  workspaceId,
}: {
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
  readonly workspaceId: string;
}) {
  const labels = getPaceAssistantLabels(language);
  return (
    <PaceAssistantLauncher
      language={language}
      locale={locale}
      pageContext={{ page: "accounts" }}
      timeZone={timeZone}
      workspaceId={workspaceId}
    >
      {({ openPaceAssistant }) => (
        <button
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#dfe5ee] bg-white px-3 text-[12px] font-medium text-[#43516a] transition-colors hover:border-[#b8d0ff] hover:bg-[#f8faff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          onClick={() => openPaceAssistant()}
          type="button"
        >
          <FiMessageCircle aria-hidden="true" className="size-3.5 text-[#2f6fed]" />
          {labels.ask}
        </button>
      )}
    </PaceAssistantLauncher>
  );
}
