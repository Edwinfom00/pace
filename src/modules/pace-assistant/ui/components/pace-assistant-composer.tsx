"use client";

import { useRef } from "react";
import { FiSend } from "react-icons/fi";

import type { PaceAssistantLabels } from "../assistant-labels";

export function PaceAssistantComposer({
  value,
  disabled,
  labels,
  onChange,
  onSend,
  autoFocus = false,
}: {
  readonly value: string;
  readonly disabled: boolean;
  readonly labels: PaceAssistantLabels;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;
  return (
    <form className="border-t border-[#edf0f4] bg-white px-3.5 py-3" onSubmit={(event) => { event.preventDefault(); if (canSend) onSend(); }}>
      <div className="flex items-end gap-2 rounded-[11px] border border-[#dfe4ec] bg-[#fcfdff] px-2.5 py-2 shadow-[0_1px_2px_rgb(24_35_61/3%)] focus-within:border-[#8db2ff] focus-within:ring-3 focus-within:ring-[#dce8ff]">
        <textarea
          aria-label={labels.placeholder}
          autoFocus={autoFocus}
          className="max-h-28 min-h-5 flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-5 text-[#263149] outline-none placeholder:text-[#98a2b3] disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 112)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={labels.placeholder}
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <button aria-label={labels.send} className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[#2f6fed] text-white transition-colors hover:bg-[#225ed6] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#e3e8f2] disabled:text-[#a0a9b9]" disabled={!canSend} type="submit"><FiSend aria-hidden className="size-3.5" /></button>
      </div>
      <p className="mt-1.5 text-[10px] text-[#98a2b3]">{labels.newLineHint}</p>
    </form>
  );
}
