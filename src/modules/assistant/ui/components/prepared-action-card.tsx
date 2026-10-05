"use client";

import { useId } from "react";
import { HiOutlinePencilSquare } from "react-icons/hi2";

import type { AssistantActionView } from "../../domain/assistant-action";
import type { AssistantMessages } from "../assistant-messages";
import { ActionStatusBar, ActionSummary } from "./assistant-action-parts";

export function PreparedActionCard({
  view,
  messages,
  note,
  disabled,
  onContinue,
}: {
  readonly view: AssistantActionView;
  readonly messages: AssistantMessages;
  readonly note?: string;
  readonly disabled?: boolean;
  readonly onContinue?: () => void;
}) {
  const headingId = useId();
  const description = note ?? messages[view.incomplete ? "action.status.incomplete" : "action.status.draftDescription"];

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-[12px] border border-dashed border-[#cfd6e2] bg-white">
      <ActionStatusBar icon={HiOutlinePencilSquare} label={messages["action.status.draft"]} tone="draft" />
      <ActionSummary effectsLabel={messages["action.field.effects"]} headingId={headingId} view={view}>
        <p className="mt-3.5 text-[12px] leading-5 text-[#65718a]">{description}</p>
      </ActionSummary>
      {onContinue && !view.incomplete ? (
        <div className="flex border-t border-[#edf0f4] px-4 py-3 sm:justify-end">
          <button
            className="inline-flex h-9 w-full items-center justify-center rounded-[9px] border border-[#d5dce8] bg-white px-3.5 text-[13px] font-semibold text-[#34405d] transition-colors hover:bg-[#f6f8fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={disabled}
            onClick={onContinue}
            type="button"
          >
            {messages["action.review"]}
          </button>
        </div>
      ) : null}
    </section>
  );
}
