"use client";

import { Button } from "@/components/ui/button";

export type TransactionFormFooterProps = {
  readonly cancelLabel: string;
  readonly formError?: string | null;
  readonly isPending?: boolean;
  readonly onCancel: () => void;
  readonly onPrimaryAction: () => void;
  readonly primaryActionLabel: string;
};

export function TransactionFormFooter({
  cancelLabel,
  formError,
  isPending = false,
  onCancel,
  onPrimaryAction,
  primaryActionLabel,
}: TransactionFormFooterProps) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
      <p aria-live="assertive" className={formError ? "mr-auto text-[12px] leading-5 text-[#c23445]" : "sr-only"} role="alert">
        {formError}
      </p>
      <Button
        className="h-10 rounded-[8px] px-3.5 text-[13px] text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:h-9"
        disabled={isPending}
        onClick={onCancel}
        type="button"
        variant="ghost"
      >
        {cancelLabel}
      </Button>
      <Button
        aria-busy={isPending || undefined}
        className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
        disabled={isPending}
        onClick={onPrimaryAction}
        type="button"
      >
        {primaryActionLabel}
      </Button>
    </footer>
  );
}
