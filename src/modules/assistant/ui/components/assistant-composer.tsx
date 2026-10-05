"use client";

import { useEffect, useId, useRef } from "react";
import { HiArrowUp } from "react-icons/hi2";

import type { AssistantMessages } from "../assistant-messages";

const MAX_HEIGHT = 168;

export function AssistantComposer({
  value,
  placeholder,
  disabled,
  messages,
  onChange,
  onSend,
}: {
  readonly value: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly messages: AssistantMessages;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
}) {
  const inputId = useId();
  const hintId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      <div className="rounded-[14px] border border-[#dbe1ea] bg-white px-3.5 pt-3 pb-2.5 shadow-[0_1px_2px_rgb(24_35_61/4%)] transition-colors focus-within:border-[#8db2ff] focus-within:ring-3 focus-within:ring-[#dce8ff]">
        <label className="sr-only" htmlFor={inputId}>
          {messages["composer.label"]}
        </label>
        <textarea
          aria-describedby={hintId}
          className="block max-h-42 min-h-6 w-full resize-none bg-transparent text-[14px] leading-6 text-[#1c2740] outline-none placeholder:text-[#8f9aad] disabled:cursor-not-allowed"
          disabled={disabled}
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={placeholder}
          ref={textareaRef}
          rows={1}
          value={value}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#98a2b3] max-sm:sr-only" id={hintId}>
            {messages["composer.hint"]}
          </p>
          <button
            aria-label={messages["composer.send"]}
            className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#2f6fed] text-white transition-colors hover:bg-[#225ed6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#e6eaf1] disabled:text-[#a0a9b9]"
            disabled={!canSend}
            title={messages["composer.send"]}
            type="submit"
          >
            <HiArrowUp aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
