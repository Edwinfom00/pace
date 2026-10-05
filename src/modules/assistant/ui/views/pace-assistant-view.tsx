"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ClientSessionState } from "eve/client";
import { useEveAgent } from "eve/react";

import {
  paceAssistantResponseSchema,
  type PaceAssistantResponsePayload,
} from "@/modules/pace-assistant/types/pace-assistant";
import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { getAssistantProgress } from "@/modules/pace-assistant/ui/views/pace-assistant-panel-view";

import { assistantReviewPrompt } from "../../domain/assistant-action";
import {
  toAssistantTurns,
  type AssistantActionRef,
} from "../../domain/assistant-conversation";
import { getAssistantMessages } from "../assistant-messages";
import { AssistantActionLifecycle } from "../components/assistant-action-lifecycle";
import type { AssistantRenderContext } from "../components/assistant-tool-result";
import { AssistantWorkspace } from "../components/assistant-workspace";

export function PaceAssistantView({
  workspaceId,
  workspaceSlug,
  language,
  locale,
  timeZone,
  snapshot,
}: {
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly snapshot: ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [lastRequest, setLastRequest] = useState<string | null>(null);
  const sessionKey = `pace-workspace-assistant:${workspaceId}`;
  const [initialSession] = useState<ClientSessionState | undefined>(() =>
    readSavedSession(sessionKey),
  );
  const agent = useEveAgent({
    headers: () => ({ "x-pace-workspace-id": workspaceId }),
    initialSession,
    resume: initialSession !== undefined,
    onSessionChange: (session) => saveSession(sessionKey, session),
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const resuming = agent.status === "resuming";
  const idle = !busy && !resuming;

  const context = useMemo<AssistantRenderContext>(
    () => ({
      messages: getAssistantMessages(language),
      language,
      locale,
      timeZone,
      workspaceSlug,
    }),
    [language, locale, timeZone, workspaceSlug],
  );
  const turns = useMemo(
    () => toAssistantTurns(agent.data.messages),
    [agent.data.messages],
  );

  const { send: sendTurn, respond: respondTurn, reset } = agent;
  const send = useCallback(
    (prompt?: string) => {
      const next = (prompt ?? draft).trim();
      if (!next || resuming) return;
      if (prompt === undefined) setDraft("");
      setLastRequest(next);
      void sendTurn<PaceAssistantResponsePayload>(next, {
        outputSchema: paceAssistantResponseSchema,
        ...(busy ? { turnPolicy: "steer" as const } : {}),
      }).catch(() => undefined);
    },
    [busy, draft, resuming, sendTurn],
  );

  const respond = useCallback(
    (requestId: string, optionId: "approve" | "cancel") =>
      respondTurn<PaceAssistantResponsePayload>([{ requestId, optionId }], {
        outputSchema: paceAssistantResponseSchema,
      }),
    [respondTurn],
  );

  const renderAction = useCallback(
    (action: AssistantActionRef) => (
      <AssistantActionLifecycle
        action={action}
        context={context}
        idle={idle}
        onRequestReview={(actionId) =>
          send(assistantReviewPrompt(context.messages, actionId))
        }
        onRespond={respond}
        workspaceId={workspaceId}
      />
    ),
    [context, idle, respond, send, workspaceId],
  );

  const working = busy
    ? getAssistantProgress(
        agent.status,
        agent.events,
        getPaceAssistantLabels(language),
      )
    : resuming
      ? context.messages["conversation.loading"]
      : null;

  return (
    <AssistantWorkspace
      composerDisabled={resuming}
      context={context}
      draft={draft}
      failed={agent.status === "error"}
      onDraftChange={setDraft}
      onReset={() => {
        setLastRequest(null);
        reset();
      }}
      onRetry={lastRequest ? () => send(lastRequest) : undefined}
      onSend={send}
      promptsDisabled={!idle}
      renderAction={renderAction}
      snapshot={snapshot}
      turns={turns}
      working={working}
    />
  );
}

function readSavedSession(key: string): ClientSessionState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as {
      readonly sessionId?: string;
    } | null;
    return saved?.sessionId
      ? { sessionId: saved.sessionId, streamIndex: 0 }
      : undefined;
  } catch {
    return undefined;
  }
}

function saveSession(key: string, session: ClientSessionState | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (session)
      window.sessionStorage.setItem(
        key,
        JSON.stringify({ sessionId: session.sessionId }),
      );
    else window.sessionStorage.removeItem(key);
  } catch {
    return;
  }
}
