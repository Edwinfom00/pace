"use client";

import { useEffect, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import {
  presentAssistantAction,
  type AssistantActionDetail,
} from "../../domain/assistant-action";
import type { AssistantActionRef } from "../../domain/assistant-conversation";
import { ApprovalCard, type ApprovalPending } from "./approval-card";
import { AssistantErrorMessage } from "./assistant-message";
import type { AssistantRenderContext } from "./assistant-tool-result";
import { ExecutedActionCard } from "./executed-action-card";
import { PreparedActionCard } from "./prepared-action-card";

export function AssistantActionLifecycle({
  action: ref,
  workspaceId,
  context,
  idle,
  onRespond,
  onRequestReview,
}: {
  readonly action: AssistantActionRef;
  readonly workspaceId: string;
  readonly context: AssistantRenderContext;
  readonly idle: boolean;
  readonly onRespond: (
    requestId: string,
    optionId: "approve" | "cancel",
  ) => Promise<void>;
  readonly onRequestReview: (actionId: string) => void;
}) {
  const [detail, setDetail] = useState<AssistantActionDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<ApprovalPending>(null);
  const [error, setError] = useState<string | null>(null);
  // An approval request is answered at most once, however often this card re-renders or its buttons are pressed.
  const answeredRequests = useRef(new Set<string>());
  const endpoint = `/api/workspaces/${workspaceId}/agent-actions/${ref.actionId}`;

  useEffect(() => {
    let current = true;
    void fetch(endpoint)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<AssistantActionDetail>)
          : null,
      )
      .catch(() => null)
      .then((next) => {
        if (!current) return;
        if (next) setDetail(next);
        setLoadFailed(!next);
        if (idle) setPending(null);
      });
    return () => {
      current = false;
    };
  }, [endpoint, ref.revision, idle]);

  if (!detail) {
    return loadFailed ? (
      <AssistantErrorMessage title={context.messages["action.loadFailed"]} />
    ) : (
      <div
        aria-busy="true"
        className="space-y-3 rounded-[12px] border border-[#e5e9f0] bg-white px-4 py-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  }

  const { messages } = context;
  const view = presentAssistantAction(detail, context);
  const status = detail.action.status;
  const requestId = ref.approvalRequestId;

  const respond = async (optionId: "approve" | "cancel") => {
    if (!requestId || !idle || answeredRequests.current.has(requestId)) return;
    answeredRequests.current.add(requestId);
    setPending(optionId);
    setError(null);
    try {
      if (optionId === "cancel") {
        const response = await fetch(`${endpoint}/reject`, { method: "POST" });
        if (!response.ok) throw new Error("Unable to cancel the action.");
        setDetail(
          (previous) =>
            previous && {
              ...previous,
              action: { ...previous.action, status: "REJECTED" },
            },
        );
      }
      await onRespond(requestId, optionId);
    } catch {
      answeredRequests.current.delete(requestId);
      setError(messages["action.status.responseFailed"]);
      setPending(null);
    }
  };

  if (status === "COMPLETED") {
    return (
      <ExecutedActionCard
        locale={context.locale}
        messages={messages}
        outcome="completed"
        timeZone={context.timeZone}
        view={view}
      />
    );
  }
  if (status === "REJECTED" || status === "FAILED") {
    return (
      <ExecutedActionCard
        locale={context.locale}
        messages={messages}
        outcome={status === "FAILED" ? "failed" : "cancelled"}
        timeZone={context.timeZone}
        view={view}
      />
    );
  }
  if (status === "DRAFT") {
    return (
      <PreparedActionCard
        disabled={!idle}
        messages={messages}
        onContinue={() => onRequestReview(detail.action.id)}
        view={view}
      />
    );
  }

  const executing = status === "APPROVED" || status === "EXECUTING";
  const canRespond = status === "WAITING_APPROVAL" && requestId !== null;

  return (
    <ApprovalCard
      disabled={!idle}
      error={error}
      messages={messages}
      onApprove={canRespond ? () => void respond("approve") : undefined}
      onCancel={canRespond ? () => void respond("cancel") : undefined}
      pending={executing ? "approve" : pending}
      view={view}
    />
  );
}
