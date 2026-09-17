"use client";

import { Button } from "@/components/ui/button";

export type TransactionFormFooterProps = {
  readonly addExpenseLabel: string;
  readonly cancelLabel: string;
  readonly onCancel: () => void;
};

export function TransactionFormFooter({ addExpenseLabel, cancelLabel, onCancel }: TransactionFormFooterProps) {
  return (
    <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
      <Button
        className="h-10 rounded-[8px] px-3.5 text-[13px] text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:h-9"
        onClick={onCancel}
        type="button"
        variant="ghost"
      >
        {cancelLabel}
      </Button>
      <Button
        className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
        type="button"
      >
        {addExpenseLabel}
      </Button>
    </footer>
  );
}
