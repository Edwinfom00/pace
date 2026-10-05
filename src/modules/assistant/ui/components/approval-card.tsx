"use client";

import { useId } from "react";
import { HiOutlineArrowPath, HiOutlineShieldCheck } from "react-icons/hi2";

import type { AssistantActionView } from "../../domain/assistant-action";
import type { AssistantMessages } from "../assistant-messages";
import { ActionStatusBar, ActionSummary } from "./assistant-action-parts";

export type ApprovalPending = "approve" | "cancel" | null;

export function ApprovalCard({
  view,
  messages,
  pending,
  disabled = false,
  error,
  onApprove,
  onCancel,
}: {
  readonly view: AssistantActionView;
  readonly messages: AssistantMessages;
  readonly pending: ApprovalPending;
  readonly disabled?: boolean;
  readonly error?: string | null;
  readonly onApprove?: () => void;
  readonly onCancel?: () => void;
}) {
  const headingId = useId();
  const canRespond = Boolean(onApprove && onCancel);
  const locked = disabled || pending !== null;

  return (
    <section
      aria-busy={pending !== null || undefined}
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[12px] border border-[#b7cdf8] bg-white shadow-[0_1px_2px_rgb(36_87_197/6%)]"
    >
      <ActionStatusBar icon={HiOutlineShieldCheck} label={messages["action.status.approval"]} tone="approval" />
      <ActionSummary effectsLabel={messages["action.field.effects"]} headingId={headingId} view={view}>
        <p className="mt-3.5 text-[12px] leading-5 text-[#65718a]">
          {messages[canRespond || pending ? "action.status.approvalDescription" : "action.status.inactive"]}
        </p>
      </ActionSummary>
      {error ? (
        <p className="border-t border-[#f1d5cf] bg-[#fffaf9] px-4 py-2.5 text-[12px] leading-5 text-[#94503f]" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p className="flex items-center gap-2 border-t border-[#e3ebfa] bg-[#f8faff] px-4 py-3.5 text-[13px] font-medium text-[#1f4fb8]" role="status">
          <HiOutlineArrowPath aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
          {messages[pending === "approve" ? "action.status.executing" : "action.status.cancelling"]}
        </p>
      ) : canRespond ? (
        <div className="flex flex-col-reverse gap-2 border-t border-[#e3ebfa] px-4 py-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex h-10 items-center justify-center rounded-[9px] border border-[#d5dce8] bg-white px-4 text-[13px] font-semibold text-[#34405d] transition-colors hover:bg-[#f6f8fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60 sm:h-9"
            disabled={locked}
            onClick={onCancel}
            type="button"
          >
            {messages["action.cancel"]}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[#2f6fed] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#225ed6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60 sm:h-9"
            disabled={locked}
            onClick={onApprove}
            type="button"
          >
            <HiOutlineShieldCheck aria-hidden className="size-4" />
            {view.approveLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
