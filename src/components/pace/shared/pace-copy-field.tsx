"use client";

import { useId, useState } from "react";
import { FiCheck, FiCopy } from "react-icons/fi";

type PaceCopyFieldProps = {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  copyErrorLabel: string;
};

export function getPaceCopyState(
  value: string,
  copiedValue: string | null,
  failedValue: string | null,
): "idle" | "copied" | "error" {
  if (copiedValue === value) return "copied";
  if (failedValue === value) return "error";
  return "idle";
}

/** Read-only credential field used for secure links without persisting them. */
export function PaceCopyField({
  label,
  value,
  copyLabel,
  copiedLabel,
  copyErrorLabel,
}: PaceCopyFieldProps) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [failedValue, setFailedValue] = useState<string | null>(null);
  const fieldId = useId();

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(value);
      setFailedValue(null);
    } catch {
      setFailedValue(value);
      setCopiedValue(null);
    }
  }

  const state = getPaceCopyState(value, copiedValue, failedValue);
  const copied = state === "copied";
  const failed = state === "error";

  return (
    <div>
      <label className="mb-2 block text-[15px] font-medium text-[#10203e]" htmlFor={fieldId}>
        {label}
      </label>
      <div className="relative">
        <input
          className="h-13 w-full rounded-[10px] border border-[#d8e1ef] bg-white py-3 pl-4 pr-12 text-[15px] text-[#31476e] outline-none selection:bg-[#d8e6ff] focus:border-[#3268ed] focus:ring-4 focus:ring-[#3268ed]/10"
          id={fieldId}
          readOnly
          value={value}
        />
        <button
          aria-label={copied ? copiedLabel : copyLabel}
          className="absolute right-1.5 top-1.5 grid size-10 place-items-center rounded-lg text-[#6178a4] transition hover:bg-[#f0f5fd] hover:text-[#3268ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3268ed]"
          onClick={copyValue}
          type="button"
        >
          {copied ? <FiCheck aria-hidden className="size-5 text-[#2b9a79]" /> : <FiCopy aria-hidden className="size-5" />}
        </button>
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-5 text-xs text-[#5d759e]">
        {copied ? copiedLabel : failed ? copyErrorLabel : ""}
      </p>
    </div>
  );
}
