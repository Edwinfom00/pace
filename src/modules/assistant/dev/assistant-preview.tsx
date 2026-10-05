"use client";

import { useMemo, useState } from "react";

import { presentAssistantAction } from "../domain/assistant-action";
import type { AssistantActionRef } from "../domain/assistant-conversation";
import { getAssistantMessages } from "../ui/assistant-messages";
import { ApprovalCard } from "../ui/components/approval-card";
import { AssistantFinancialSnapshot } from "../ui/components/assistant-financial-snapshot";
import type { AssistantRenderContext } from "../ui/components/assistant-tool-result";
import { AssistantWorkspace } from "../ui/components/assistant-workspace";
import { ExecutedActionCard } from "../ui/components/executed-action-card";
import { PreparedActionCard } from "../ui/components/prepared-action-card";
import {
  assistantPreviewActions,
  assistantPreviewSnapshot,
  assistantPreviewTurns,
  type AssistantPreviewState,
} from "./assistant-fixtures";

export function AssistantPreview({
  state,
  language,
}: {
  readonly state: AssistantPreviewState;
  readonly language: string;
}) {
  const [draft, setDraft] = useState("");
  const context = useMemo<AssistantRenderContext>(
    () => ({
      messages: getAssistantMessages(language),
      language,
      locale: assistantPreviewSnapshot.locale,
      timeZone: assistantPreviewSnapshot.timeZone,
      workspaceSlug: "personal",
    }),
    [language],
  );

  const renderAction = ({ actionId }: AssistantActionRef) => {
    const detail = assistantPreviewActions[actionId];
    if (!detail) return null;
    const view = presentAssistantAction(detail, context);
    const shared = { messages: context.messages, view };
    switch (detail.action.status) {
      case "DRAFT":
        return <PreparedActionCard {...shared} onContinue={() => undefined} />;
      case "COMPLETED":
        return <ExecutedActionCard {...shared} locale={context.locale} outcome="completed" timeZone={context.timeZone} />;
      case "REJECTED":
        return <ExecutedActionCard {...shared} locale={context.locale} outcome="cancelled" timeZone={context.timeZone} />;
      case "FAILED":
        return <ExecutedActionCard {...shared} locale={context.locale} outcome="failed" timeZone={context.timeZone} />;
      default:
        return (
          <ApprovalCard
            {...shared}
            onApprove={() => undefined}
            onCancel={() => undefined}
            pending={detail.action.status === "EXECUTING" ? "approve" : null}
          />
        );
    }
  };

  return (
    <AssistantWorkspace
      composerDisabled={false}
      context={context}
      draft={draft}
      failed={state === "error"}
      onDraftChange={setDraft}
      onReset={() => undefined}
      onRetry={() => undefined}
      onSend={() => setDraft("")}
      promptsDisabled={state === "working"}
      renderAction={renderAction}
      snapshot={
        <AssistantFinancialSnapshot
          messages={context.messages}
          snapshot={assistantPreviewSnapshot}
          workspaceSlug={context.workspaceSlug}
        />
      }
      turns={assistantPreviewTurns[state]}
      working={state === "working" ? "Retrieving financial information..." : null}
    />
  );
}
