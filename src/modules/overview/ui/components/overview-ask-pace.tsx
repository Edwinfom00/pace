"use client";

import { useState } from "react";
import { FiSend } from "react-icons/fi";

import { getPaceAssistantLabels, getPaceAssistantSuggestions } from "@/modules/pace-assistant/ui/assistant-labels";
import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";
import type { PacePageContext } from "@/modules/pace-assistant/domain/page-context";

export function OverviewAskPace({
  workspaceId,
  pageContext,
  language,
  locale,
  timeZone,
}: {
  readonly workspaceId: string;
  readonly pageContext: PacePageContext;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
}) {
  const labels = getPaceAssistantLabels(language);
  const suggestions = getPaceAssistantSuggestions(language);
  const [prompt, setPrompt] = useState("");

  return (
    <PaceAssistantLauncher
      language={language}
      locale={locale}
      pageContext={pageContext}
      timeZone={timeZone}
      workspaceId={workspaceId}
    >
      {({ openPaceAssistant }) => {
        const send = () => {
          const next = prompt.trim();
          if (!next) return;
          setPrompt("");
          openPaceAssistant(next);
        };
        return (
          <section aria-labelledby="overview-ask-pace-heading" className="border-t border-[#edf0f4] px-5 py-5 sm:px-6">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#101a35]" id="overview-ask-pace-heading">{labels.ask}</h2>
            <form className="mt-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
              <div className="flex h-11 items-center gap-2 rounded-[10px] border border-[#dfe4ec] bg-[#fcfdff] pl-3.5 focus-within:border-[#8db2ff] focus-within:ring-3 focus-within:ring-[#dce8ff]">
                <label className="sr-only" htmlFor="overview-ask-pace-input">{labels.placeholder}</label>
                <input
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-[#263149] outline-none placeholder:text-[#66758d]"
                  id="overview-ask-pace-input"
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={labels.placeholder}
                  value={prompt}
                />
                <button aria-label={labels.send} className="mr-1 flex size-9 shrink-0 items-center justify-center rounded-[8px] text-[#62718a] transition-colors hover:bg-[#edf3ff] hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:text-[#b5bfce]" disabled={!prompt.trim()} type="submit">
                  <FiSend aria-hidden className="size-4" />
                </button>
              </div>
            </form>
            <div aria-label={labels.suggestedQuestions} className="mt-3 flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button className="rounded-full border border-[#e2e7ef] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#536079] transition-colors hover:border-[#b9cffd] hover:bg-[#f6f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] active:translate-y-px" key={suggestion} onClick={() => openPaceAssistant(suggestion)} type="button">
                  {suggestion}
                </button>
              ))}
            </div>
          </section>
        );
      }}
    </PaceAssistantLauncher>
  );
}
