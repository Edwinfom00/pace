"use client";

import { useRef, useState } from "react";

import {
  INVITE_CODE_LENGTH,
  normalizeInvitationCode,
} from "@/modules/workspaces/invite-code";

type InviteCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  describedBy?: string;
};

export { normalizeInvitationCode };

export function PaceInviteCodeInput({
  describedBy,
  id = "pace-invite-code",
  onChange,
  value,
}: InviteCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function focusAt(index: number) {
    const nextIndex = Math.max(0, Math.min(index, INVITE_CODE_LENGTH));
    setActiveIndex(nextIndex);
    inputRef.current?.focus();
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(nextIndex, nextIndex));
  }

  function commit(nextValue: string, nextIndex = nextValue.length) {
    const normalized = normalizeInvitationCode(nextValue);
    onChange(normalized);
    focusAt(Math.min(nextIndex, normalized.length));
  }

  return (
    <div className="relative" onMouseDown={(event) => event.preventDefault()}>
      <input
        aria-describedby={describedBy}
        aria-label="Invite code"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoFocus
        className="absolute size-px overflow-hidden opacity-0"
        id={id}
        inputMode="text"
        maxLength={INVITE_CODE_LENGTH}
        onChange={(event) => {
          const nextValue = normalizeInvitationCode(event.currentTarget.value);
          onChange(nextValue);
          setActiveIndex(Math.min(event.currentTarget.selectionStart ?? nextValue.length, nextValue.length));
        }}
        onFocus={() => setActiveIndex(Math.min(value.length, INVITE_CODE_LENGTH))}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          const start = input.selectionStart ?? value.length;
          const end = input.selectionEnd ?? start;

          if (event.key === "ArrowLeft") {
            event.preventDefault();
            focusAt(start - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            focusAt(end + 1);
          } else if (event.key === "Backspace" && start > 0) {
            event.preventDefault();
            const deletionStart = end > start ? start : start - 1;
            commit(`${value.slice(0, deletionStart)}${value.slice(end)}`, deletionStart);
          }
        }}
        onPaste={(event) => {
          event.preventDefault();
          const pasted = normalizeInvitationCode(event.clipboardData.getData("text"));
          commit(pasted, pasted.length);
        }}
        value={value}
      />
      <div
        className="flex items-center justify-between gap-2 sm:gap-3"
        onPaste={(event) => {
          event.preventDefault();
          const pasted = normalizeInvitationCode(event.clipboardData.getData("text"));
          commit(pasted, pasted.length);
        }}
        role="presentation"
      >
        {[...Array(INVITE_CODE_LENGTH)].map((_, index) => {
          const isSeparator = index === 4;
          const isActive = activeIndex === index;
          return (
            <div className="contents" key={index}>
              {isSeparator ? <span aria-hidden="true" className="mx-0.5 text-xl font-bold text-[#17213a]">−</span> : null}
              <button
                aria-hidden="true"
                className={`grid h-[3.65rem] min-w-0 flex-1 place-items-center rounded-[0.65rem] border bg-white text-xl font-semibold text-[#15203a] transition sm:h-[4.45rem] ${
                  isActive
                    ? "border-[#1760f5] ring-3 ring-[#1760f5]/12"
                    : "border-[#cad5e7] hover:border-[#aabbd7]"
                }`}
                key={`cell-${index}`}
                onClick={() => focusAt(index)}
                tabIndex={-1}
                type="button"
              >
                {value[index] ?? <span className="size-2 rounded-full bg-[#bcc6d8]" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
