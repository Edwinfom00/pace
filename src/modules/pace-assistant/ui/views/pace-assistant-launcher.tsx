"use client";

import { useCallback, useEffect, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import { PacePageContextProvider } from "../../context/pace-page-context";
import type { PacePageContext } from "../../domain/page-context";
import { getPaceAssistantLabels } from "../assistant-labels";
import { PaceAssistantPanelView } from "./pace-assistant-panel-view";

export function PaceAssistantLauncher({
  workspaceId,
  pageContext,
  language,
  locale,
  timeZone,
  children,
}: {
  readonly workspaceId: string;
  readonly pageContext: PacePageContext;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly children: (controls: { readonly openPaceAssistant: (prompt?: string) => void }) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [wideSheet, setWideSheet] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const labels = getPaceAssistantLabels(language);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setWideSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const openPaceAssistant = useCallback((prompt?: string) => {
    const focused = document.activeElement;
    setReturnFocus(focused instanceof HTMLElement ? focused : null);
    setInitialPrompt(prompt?.trim() || null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => returnFocus?.focus(), 0);
  }, [returnFocus]);

  return (
    <PacePageContextProvider context={pageContext}>
      {children({ openPaceAssistant })}
      <Sheet onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()} open={open}>
        <SheetContent
          aria-describedby={undefined}
          className={wideSheet
            ? "h-[100dvh] w-full max-w-none gap-0 p-0 sm:max-w-[460px]"
            : "!h-[100dvh] !max-h-[100dvh] w-full max-w-none gap-0 p-0"}
          showCloseButton={false}
          side={wideSheet ? "right" : "bottom"}
        >
          <SheetTitle className="sr-only">{labels.ask}</SheetTitle>
          {open ? (
            <PaceAssistantPanelView
              autoFocusComposer
              className="h-full rounded-none border-x-0 border-b-0 shadow-none"
              initialPrompt={initialPrompt}
              key={workspaceId}
              language={language}
              locale={locale}
              onClose={close}
              timeZone={timeZone}
              workspaceId={workspaceId}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </PacePageContextProvider>
  );
}
