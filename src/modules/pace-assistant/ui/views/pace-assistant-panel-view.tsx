"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronRight, FiX, FiZap } from "react-icons/fi";
import type { ClientSessionState } from "eve/client";
import { useEveAgent, type EveMessage } from "eve/react";

import { PaceLogo } from "@/components/pace/brand/pace-logo";

import { usePacePageContext } from "../../context/pace-page-context";
import { createPaceAssistantTurnOptions } from "../../domain/turn-options";
import { paceAssistantResponseSchema, type PaceAssistantResponsePayload } from "../../types/pace-assistant";
import { getPaceAssistantLabels, getPaceAssistantSuggestions } from "../assistant-labels";
import { PaceAssistantComposer } from "../components/pace-assistant-composer";
import { PaceAssistantResponse } from "../components/pace-assistant-response";
import { PaceEveActionLifecycle } from "../components/pace-eve-action-lifecycle";
import { TextBlock } from "../components/blocks/text-block";

type SavedSession = { readonly sessionId: string };

export function PaceAssistantPanelView({
  workspaceId,
  language,
  locale,
  timeZone,
  className,
  onClose,
  onCollapse,
}: {
  readonly workspaceId: string;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly className?: string;
  readonly onClose?: () => void;
  readonly onCollapse?: () => void;
}) {
  const pageContext = usePacePageContext();
  const labels = getPaceAssistantLabels(language);
  const suggestions = getPaceAssistantSuggestions(language);
  const [draft, setDraft] = useState("");
  const [lastRequest, setLastRequest] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionKey = `pace-assistant:${workspaceId}`;
  const [initialSession] = useState<ClientSessionState | undefined>(() => readSavedSession(sessionKey));
  const agent = useEveAgent({
    headers: () => ({ "x-pace-workspace-id": workspaceId }),
    initialSession,
    resume: initialSession !== undefined,
    onSessionChange: (session) => saveSession(sessionKey, session),
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const resuming = agent.status === "resuming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [agent.data.messages, agent.status]);

  const send = async (message?: string) => {
    const next = (message ?? draft).trim();
    if (!next || resuming) return;
    setDraft("");
    setLastRequest(next);
    await agent.send<PaceAssistantResponsePayload>(next, createPaceAssistantTurnOptions(pageContext, busy));
  };

  const messages = useMemo(() => agent.data.messages, [agent.data.messages]);
  const progress = getAssistantProgress(agent.status, agent.events, labels);
  return (
    <section aria-label={labels.ask} className={`flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white shadow-[0_8px_30px_rgb(27_43_75/4%)] ${className ?? ""}`}>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#edf0f4] px-3.5">
        <div className="flex items-center gap-2"><PaceLogo alt="" height={26} variant="icon" width={26} /><span className="text-[14px] font-semibold tracking-[-0.02em] text-[#1c2740]">Pace</span><span className="rounded-[5px] bg-[#eef4ff] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-[#2f6fed]">AI</span></div>
        {onClose ? <button aria-label={labels.close} className="flex size-7 items-center justify-center rounded-[7px] text-[#758198] hover:bg-[#f3f5f8] hover:text-[#3e4c65]" onClick={onClose} type="button"><FiX aria-hidden className="size-4" /></button> : onCollapse ? <button aria-label={labels.collapse} className="flex size-7 items-center justify-center rounded-[7px] text-[#758198] hover:bg-[#f3f5f8] hover:text-[#3e4c65]" onClick={onCollapse} type="button"><FiChevronRight aria-hidden className="size-4" /></button> : null}
      </header>
      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4" role="log">
        {messages.length === 0 ? <AssistantEmptyState labels={labels} suggestions={suggestions} onSuggestion={(suggestion) => void send(suggestion)} /> : <div className="space-y-5">{messages.map((message) => <AssistantMessage key={message.id} labels={labels} locale={locale} message={message} timeZone={timeZone} />)}<PaceEveActionLifecycle labels={labels} messages={messages} onRequestReview={async (actionId) => send(`Review the existing action ${actionId} and prepare it for approval.`)} onRespond={async (requestId, optionId) => { await agent.respond([{ requestId, optionId }], createPaceAssistantTurnOptions(pageContext)); }} workspaceId={workspaceId} />{busy ? <div className="flex items-center gap-2 text-[12px] text-[#71809a]"><span className="flex size-5 items-center justify-center rounded-full bg-[#eef4ff] text-[#2f6fed]"><FiZap aria-hidden className="size-3" /></span>{progress}</div> : null}{agent.status === "error" ? <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#f3ded9] bg-[#fff9f8] p-3 text-[12px] text-[#a64535]" role="alert"><span>{labels.unableToRespond}</span>{lastRequest ? <button className="shrink-0 font-medium underline underline-offset-2" onClick={() => void send(lastRequest)} type="button">{labels.retry}</button> : null}</div> : null}</div>}
        <div ref={bottomRef} />
      </div>
      <PaceAssistantComposer disabled={resuming} labels={labels} onChange={setDraft} onSend={() => void send()} value={draft} />
    </section>
  );
}

function AssistantEmptyState({
  labels,
  suggestions,
  onSuggestion,
}: {
  readonly labels: ReturnType<typeof getPaceAssistantLabels>;
  readonly suggestions: readonly string[];
  readonly onSuggestion: (suggestion: string) => void;
}) {
  return <div className="flex min-h-full flex-col justify-end pb-2"><div className="rounded-[12px] bg-[#f8faff] p-3.5"><p className="text-[13px] font-medium text-[#34405a]">{labels.noMessages}</p><p className="mt-1 text-[11px] leading-4 text-[#7d889c]">{labels.suggestedQuestions}</p></div><div className="mt-3 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button className="rounded-full border border-[#e2e7ef] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#536079] transition-colors hover:border-[#b9cffd] hover:bg-[#f6f9ff] active:translate-y-px" key={suggestion} onClick={() => onSuggestion(suggestion)} type="button">{suggestion}</button>)}</div></div>;
}

function AssistantMessage({
  message,
  locale,
  timeZone,
  labels,
}: {
  readonly message: EveMessage;
  readonly locale: string;
  readonly timeZone: string;
  readonly labels: ReturnType<typeof getPaceAssistantLabels>;
}) {
  const structured = message.role === "assistant" ? parseStructuredResponse(message.metadata?.result) : null;
  const text = message.parts.filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text").map((part) => part.text).join("");
  const streamStillVisible = message.metadata?.status === "streaming" || !structured;
  if (message.role === "user") return <article className="ml-auto max-w-[84%]"><p className="mb-1 text-right text-[10px] font-medium text-[#8a94a7]">{labels.you}</p><div className="rounded-[11px] rounded-br-[3px] bg-[#edf4ff] px-3 py-2 text-[13px] leading-5 text-[#31415f]">{text}</div></article>;
  return <article className="max-w-full"><div className="mb-1.5 flex items-center gap-1.5"><PaceLogo alt="" height={18} variant="icon" width={18} /><span className="text-[11px] font-semibold text-[#4b5870]">{labels.assistant}</span></div>{streamStillVisible && text ? <div className="mb-3"><TextBlock text={text} /></div> : null}{structured ? <PaceAssistantResponse blocks={structured.blocks} labels={labels} locale={locale} timeZone={timeZone} /> : null}</article>;
}

export function getAssistantProgress(status: string, events: readonly { readonly type: string; readonly data?: unknown }[], labels: ReturnType<typeof getPaceAssistantLabels>): string {
  if (status === "submitted") return labels.sending;
  const turnStart = events.map((event) => event.type).lastIndexOf("turn.started");
  for (let index = events.length - 1; index >= Math.max(0, turnStart); index -= 1) {
    switch (events[index]!.type) {
      case "input.requested": return labels.waitingApproval;
      case "action.result": return labels.verifying;
      case "actions.requested": {
        const toolNames = requestedToolNames(events[index]!.data);
        if (toolNames.some((toolName) => toolName.startsWith("get_"))) return labels.retrieving;
        if (toolNames.some((toolName) => /^(create|edit|submit)_/.test(toolName))) return labels.preparingApproval;
        return labels.checking;
      }
      case "message.appended":
      case "message.completed": return labels.preparing;
    }
  }
  return labels.checking;
}

function requestedToolNames(data: unknown): readonly string[] {
  if (!data || typeof data !== "object" || !("actions" in data)) return [];
  const actions = (data as { readonly actions?: unknown }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action) => action && typeof action === "object" && "toolName" in action && typeof action.toolName === "string" ? [action.toolName] : []);
}

function parseStructuredResponse(value: unknown): PaceAssistantResponsePayload | null {
  const parsed = paceAssistantResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function readSavedSession(key: string): ClientSessionState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as SavedSession | null;
    return saved?.sessionId ? { sessionId: saved.sessionId, streamIndex: 0 } : undefined;
  } catch { return undefined; }
}

function saveSession(key: string, session: ClientSessionState | undefined) {
  if (typeof window === "undefined") return;
  if (!session) { window.sessionStorage.removeItem(key); return; }
  window.sessionStorage.setItem(key, JSON.stringify({ sessionId: session.sessionId } satisfies SavedSession));
}
