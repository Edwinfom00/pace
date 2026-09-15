"use client";

import { useEffect, useState } from "react";
import { FiMessageCircle } from "react-icons/fi";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

import type { PacePageContext } from "../../domain/page-context";
import { PacePageContextProvider } from "../../context/pace-page-context";
import { getPaceAssistantLabels } from "../assistant-labels";
import { PaceAssistantPanelView } from "./pace-assistant-panel-view";

export function PaceAssistantSurface({
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
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const labels = getPaceAssistantLabels(language);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return <PacePageContextProvider context={pageContext}>{isDesktop ? <aside className={`sticky top-5 ${collapsed ? "w-10" : "h-[calc(100svh-2.5rem)] min-h-[580px] w-[360px]"}`}>{collapsed ? <button aria-label={labels.expand} className="flex size-10 items-center justify-center rounded-[10px] border border-[#dce3ed] bg-white text-[#2f6fed] shadow-[0_1px_2px_rgb(24_35_61/3%)] hover:border-[#b8d0ff] hover:bg-[#f8faff]" onClick={() => setCollapsed(false)} title={labels.expand} type="button"><FiMessageCircle aria-hidden className="size-4" /></button> : null}<PaceAssistantPanelView className={collapsed ? "hidden" : "h-full"} key={workspaceId} language={language} locale={locale} onCollapse={() => setCollapsed(true)} timeZone={timeZone} workspaceId={workspaceId} /></aside> : <><button aria-haspopup="dialog" className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[#dce3ed] bg-white px-3 text-[12px] font-medium text-[#43516a] shadow-[0_1px_2px_rgb(24_35_61/3%)] hover:border-[#b8d0ff] hover:bg-[#f8faff] active:translate-y-px" onClick={() => setOpen(true)} type="button"><FiMessageCircle aria-hidden className="size-4 text-[#2f6fed]" />{labels.ask}</button><Sheet onOpenChange={setOpen} open={open}><SheetContent aria-describedby={undefined} className="h-[100dvh] max-h-[100dvh] gap-0 p-0 md:h-[min(84dvh,760px)] md:rounded-t-[16px]" showCloseButton={false} side="bottom"><SheetTitle className="sr-only">{labels.ask}</SheetTitle>{open ? <PaceAssistantPanelView className="h-full rounded-none border-x-0 border-b-0 shadow-none md:rounded-t-[14px]" key={workspaceId} language={language} locale={locale} onClose={() => setOpen(false)} timeZone={timeZone} workspaceId={workspaceId} /> : null}</SheetContent></Sheet></>}</PacePageContextProvider>;
}
