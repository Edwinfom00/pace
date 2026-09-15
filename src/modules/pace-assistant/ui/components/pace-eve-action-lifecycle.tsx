"use client";

import { useEffect, useMemo, useState } from "react";
import { FiCheck, FiEdit3, FiShield } from "react-icons/fi";
import type { EveDynamicToolPart, EveMessage } from "eve/react";

import type { PaceAssistantLabels } from "../assistant-labels";

type AgentAction = {
  readonly id: string;
  readonly status: "DRAFT" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETED" | "FAILED";
  readonly type: string;
  readonly draft: Record<string, unknown>;
  readonly result?: { readonly verifiedAt?: string } | null;
  readonly failureMessage?: string | null;
};

type ActionDetail = { readonly action: AgentAction };

type PendingAction = { readonly actionId: string; readonly approvalRequestId?: string };

export function PaceEveActionLifecycle({
  messages,
  workspaceId,
  labels,
  onRespond,
  onRequestReview,
}: {
  readonly messages: readonly EveMessage[];
  readonly workspaceId: string;
  readonly labels: PaceAssistantLabels;
  readonly onRespond: (requestId: string, optionId: string) => Promise<void>;
  readonly onRequestReview: (actionId: string) => Promise<void>;
}) {
  const actions = useMemo(() => collectActions(messages), [messages]);
  if (actions.length === 0) return null;
  return <div className="space-y-2">{actions.map((pending) => <PaceActionLifecycleCard action={pending} key={pending.actionId} labels={labels} onRequestReview={onRequestReview} onRespond={onRespond} workspaceId={workspaceId} />)}</div>;
}

function PaceActionLifecycleCard({
  action: pending,
  workspaceId,
  labels,
  onRespond,
  onRequestReview,
}: {
  readonly action: PendingAction;
  readonly workspaceId: string;
  readonly labels: PaceAssistantLabels;
  readonly onRespond: (requestId: string, optionId: string) => Promise<void>;
  readonly onRequestReview: (actionId: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let current = true;
    void fetch(`/api/workspaces/${workspaceId}/agent-actions/${pending.actionId}`)
      .then((response) => response.ok ? response.json() as Promise<ActionDetail> : null)
      .then((next) => { if (current) setDetail(next); });
    return () => { current = false; };
  }, [pending.actionId, workspaceId]);

  if (!detail) return null;
  const { action } = detail;
  const title = actionTitle(action, labels);
  const fields = actionFields(action, labels);
  const awaitingApproval = action.status === "WAITING_APPROVAL" && pending.approvalRequestId;

  const cancel = async () => {
    if (!pending.approvalRequestId) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/agent-actions/${action.id}/reject`, { method: "POST" });
      if (!response.ok) throw new Error("Unable to cancel the action.");
      await onRespond(pending.approvalRequestId, "cancel");
      const payload = await response.json() as ActionDetail;
      setDetail(payload);
    } finally { setWorking(false); }
  };

  return <section className="rounded-[12px] border border-[#dce7fb] bg-[#fbfdff] p-3.5"><div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#edf4ff] text-[#2f6fed]">{awaitingApproval ? <FiShield aria-hidden className="size-3.5" /> : action.status === "COMPLETED" ? <FiCheck aria-hidden className="size-3.5" /> : <FiEdit3 aria-hidden className="size-3.5" />}</span><div className="min-w-0 flex-1"><h3 className="text-[13px] font-semibold text-[#263149]">{title}</h3><p className="mt-0.5 text-[11px] leading-4 text-[#71809a]">{action.status === "COMPLETED" ? labels.verifiedByPace : action.status === "FAILED" ? action.failureMessage ?? labels.actionFailed : awaitingApproval ? labels.actionRequiresApproval : labels.actionPrepared}</p></div></div><dl className="mt-3 space-y-1.5 border-t border-[#e8eef9] pt-3">{fields.map((field) => <div className="flex items-center justify-between gap-3 text-xs" key={field.label}><dt className="text-[#7b859a]">{field.label}</dt><dd className="truncate text-right font-medium text-[#34405a]">{field.value}</dd></div>)}</dl>{action.status === "DRAFT" ? <div className="mt-3 flex gap-2"><button className="h-7 rounded-[7px] border border-[#d8dfeb] bg-white px-2.5 text-[11px] font-medium text-[#41506a] hover:bg-[#f7f9fc]" onClick={() => void onRequestReview(action.id)} type="button">{labels.edit}</button></div> : null}{awaitingApproval ? <div className="mt-3 flex gap-2"><button className="h-7 rounded-[7px] bg-[#2f6fed] px-2.5 text-[11px] font-medium text-white hover:bg-[#225ed6] disabled:opacity-60" disabled={working} onClick={() => void onRespond(pending.approvalRequestId!, "approve")} type="button">{labels.confirm}</button><button className="h-7 rounded-[7px] border border-[#d8dfeb] bg-white px-2.5 text-[11px] font-medium text-[#41506a] hover:bg-[#f7f9fc] disabled:opacity-60" disabled={working} onClick={() => void cancel()} type="button">{labels.cancel}</button></div> : null}</section>;
}

function actionTitle(action: AgentAction, labels: PaceAssistantLabels): string {
  if (action.type !== "TRANSACTION_CREATE") return labels.planChange;
  if (action.draft.kind === "TRANSFER") return labels.transfer;
  return action.draft.kind === "INCOME" ? labels.income : labels.expense;
}

function actionFields(action: AgentAction, labels: PaceAssistantLabels): readonly { readonly label: string; readonly value: string }[] {
  const draft = action.draft;
  const fields: Array<{ label: string; value: string }> = [];
  const amount = typeof draft.amountText === "string" ? draft.amountText : typeof draft.targetAmountText === "string" ? draft.targetAmountText : null;
  if (amount) fields.push({ label: labels.amount, value: amount });
  const date = typeof draft.occurredAt === "string" ? draft.occurredAt.slice(0, 10) : typeof draft.targetDate === "string" ? draft.targetDate.slice(0, 10) : null;
  if (date) fields.push({ label: labels.date, value: date });
  const name = typeof draft.merchantName === "string" ? draft.merchantName : typeof draft.name === "string" ? draft.name : null;
  if (name) fields.push({ label: labels.details, value: name });
  return fields.length ? fields : [{ label: labels.status, value: action.status }];
}

function collectActions(messages: readonly EveMessage[]): readonly PendingAction[] {
  const found = new Map<string, PendingAction>();
  for (const message of messages) for (const candidate of message.parts) {
    if (candidate.type !== "dynamic-tool") continue;
    const part = candidate as EveDynamicToolPart;
    const actionId = actionIdFromPart(part);
    if (!actionId) continue;
    const previous = found.get(actionId);
    found.set(actionId, { actionId, approvalRequestId: part.state === "approval-requested" ? part.approval.id : previous?.approvalRequestId });
  }
  return [...found.values()];
}

function actionIdFromPart(part: EveDynamicToolPart): string | null {
  const candidate = part.state === "output-available" ? part.output : "input" in part ? part.input : undefined;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const record = candidate as Record<string, unknown>;
  return typeof record.actionId === "string" ? record.actionId : typeof record.id === "string" && part.toolName.includes("draft") ? record.id : null;
}
