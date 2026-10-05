"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { HiOutlineArrowDown, HiOutlinePlus } from "react-icons/hi2";

import type {
  AssistantActionRef,
  AssistantTurn,
} from "../../domain/assistant-conversation";
import { AssistantPromptProvider } from "../context/assistant-prompt-context";
import { AssistantComposer } from "./assistant-composer";
import { AssistantEmptyState } from "./assistant-empty-state";
import {
  AssistantErrorMessage,
  AssistantWorkingState,
  PaceMessage,
  UserMessage,
} from "./assistant-message";
import {
  ASSISTANT_QUICK_QUESTIONS,
  AssistantRightRail,
} from "./assistant-right-rail";
import { AssistantSuggestionChip } from "./assistant-suggestion";
import {
  AssistantToolResult,
  type AssistantRenderContext,
} from "./assistant-tool-result";

const FOLLOW_THRESHOLD = 48;

export function AssistantWorkspace({
  context,
  turns,
  renderAction,
  working,
  failed,
  draft,
  composerDisabled,
  promptsDisabled,
  snapshot,
  onDraftChange,
  onSend,
  onRetry,
  onReset,
}: {
  readonly context: AssistantRenderContext;
  readonly turns: readonly AssistantTurn[];
  readonly renderAction: (action: AssistantActionRef) => ReactNode;
  readonly working: string | null;
  readonly failed: boolean;
  readonly draft: string;
  readonly composerDisabled: boolean;
  readonly promptsDisabled: boolean;
  readonly snapshot: ReactNode;
  readonly onDraftChange: (value: string) => void;
  readonly onSend: (prompt?: string) => void;
  readonly onRetry?: () => void;
  readonly onReset?: () => void;
}) {
  const { messages } = context;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [atEnd, setAtEnd] = useState(true);
  const empty = turns.length === 0 && !working && !failed;

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scrollRef.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  const jumpToEnd = useCallback(() => {
    followRef.current = true;
    setAtEnd(true);
    scrollToEnd(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    );
  }, [scrollToEnd]);

  useEffect(() => {
    if (followRef.current) scrollToEnd();
  }, [turns, working, failed, scrollToEnd]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) scrollToEnd();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToEnd]);

  const send = useCallback(
    (prompt?: string) => {
      followRef.current = true;
      setAtEnd(true);
      onSend(prompt);
    },
    [onSend],
  );
  const prompt = useMemo(
    () => ({ ask: send, disabled: promptsDisabled }),
    [send, promptsDisabled],
  );

  return (
    <AssistantPromptProvider value={prompt}>
      <main className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 sm:h-[calc(100dvh-68px)]">
        <section
          aria-labelledby="assistant-title"
          className="flex min-w-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-[#e7eaf0] bg-white px-4 py-3 sm:px-7 lg:px-10">
            <div className="mx-auto flex w-full max-w-195 items-center justify-between gap-4">
              <div className="min-w-0">
                <h1
                  className="text-[18px] leading-6 font-semibold tracking-[-0.02em] text-[#101a35]"
                  id="assistant-title">
                  {messages["page.title"]}
                </h1>
                <p className="truncate text-[13px] leading-5 text-[#65718a]">
                  {messages["page.subtitle"]}
                </p>
              </div>
              {onReset && turns.length > 0 ? (
                <button
                  aria-label={messages["page.newConversation"]}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-[#dce3ed] bg-white px-2.5 text-[12px] font-semibold text-[#43516a] transition-colors hover:border-[#b8d0ff] hover:bg-[#f8faff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={promptsDisabled}
                  onClick={onReset}
                  title={messages["page.newConversation"]}
                  type="button">
                  <HiOutlinePlus aria-hidden className="size-4" />
                  <span className="max-sm:sr-only">
                    {messages["page.newConversation"]}
                  </span>
                </button>
              ) : null}
            </div>
          </header>

          <div className="relative min-h-0 flex-1">
            <div
              className="absolute inset-0 overflow-y-auto overscroll-contain px-4 sm:px-7 lg:px-10"
              onScroll={(event) => {
                const { scrollHeight, scrollTop, clientHeight } =
                  event.currentTarget;
                const next =
                  scrollHeight - scrollTop - clientHeight <= FOLLOW_THRESHOLD;
                followRef.current = next;
                setAtEnd(next);
              }}
              ref={scrollRef}>
              <div
                className="mx-auto flex min-h-full w-full max-w-195 flex-col"
                ref={contentRef}>
                {empty ? (
                  <AssistantEmptyState
                    disabled={promptsDisabled}
                    messages={messages}
                    onSelect={send}
                  />
                ) : (
                  <div
                    aria-label={messages["conversation.label"]}
                    aria-live="polite"
                    className="space-y-6 py-6"
                    role="log">
                    {turns.map((turn) =>
                      turn.role === "user" ? (
                        <UserMessage
                          key={turn.id}
                          messages={messages}
                          text={turn.text}
                        />
                      ) : (
                        <AssistantTurnView
                          context={context}
                          key={turn.id}
                          renderAction={renderAction}
                          turn={turn}
                        />
                      ),
                    )}
                    {working ? (
                      <AssistantWorkingState
                        label={working}
                        messages={messages}
                      />
                    ) : null}
                    {failed ? (
                      <AssistantErrorMessage
                        description={messages["error.description"]}
                        onRetry={onRetry}
                        retryLabel={messages["error.retry"]}
                        title={messages["error.title"]}
                      />
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            {!atEnd ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <button
                  className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-[#cbd9f3] bg-white px-3 text-[12px] font-semibold text-[#245ecf] shadow-[0_1px_3px_rgb(27_43_75/12%)] transition-colors hover:border-[#9fbbec] hover:bg-[#f6f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed]"
                  onClick={jumpToEnd}
                  type="button">
                  <HiOutlineArrowDown aria-hidden className="size-3.5" />
                  {messages["conversation.scrollToLatest"]}
                </button>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 px-4 pt-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-7 lg:px-10">
            <div className="mx-auto w-full max-w-195">
              {empty ? (
                <ul
                  aria-label={messages["rail.quick.title"]}
                  className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0 xl:hidden">
                  {ASSISTANT_QUICK_QUESTIONS.map(
                    ({ label, prompt: question }) => (
                      <li className="shrink-0" key={label}>
                        <AssistantSuggestionChip
                          disabled={promptsDisabled}
                          label={messages[label]}
                          onSelect={() => send(messages[question])}
                        />
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
              <AssistantComposer
                disabled={composerDisabled}
                messages={messages}
                onChange={onDraftChange}
                onSend={() => send()}
                placeholder={
                  messages[
                    empty
                      ? "composer.placeholder"
                      : "composer.placeholderFollowUp"
                  ]
                }
                value={draft}
              />
            </div>
          </div>
        </section>
        <AssistantRightRail messages={messages} snapshot={snapshot} />
      </main>
    </AssistantPromptProvider>
  );
}

function AssistantTurnView({
  turn,
  context,
  renderAction,
}: {
  readonly turn: Extract<AssistantTurn, { role: "assistant" }>;
  readonly context: AssistantRenderContext;
  readonly renderAction: (action: AssistantActionRef) => ReactNode;
}) {
  const { messages } = context;
  if (turn.state === "malformed") {
    return (
      <PaceMessage messages={messages}>
        <AssistantErrorMessage title={messages["error.malformed"]} />
      </PaceMessage>
    );
  }
  if (!turn.text && turn.blocks.length === 0 && turn.actions.length === 0)
    return null;

  return (
    <PaceMessage messages={messages}>
      {turn.text ? (
        <AssistantToolResult
          block={{ type: "text", text: turn.text }}
          context={context}
          index={-1}
        />
      ) : null}
      {turn.blocks.map((block, index) => (
        <AssistantToolResult
          block={block}
          context={context}
          index={index}
          key={`${block.type}-${index}`}
        />
      ))}
      {turn.actions.map((action) => (
        <div key={action.actionId}>{renderAction(action)}</div>
      ))}
    </PaceMessage>
  );
}
