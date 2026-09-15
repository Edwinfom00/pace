"use client";

import { MoreHorizontal } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { TransactionRowAction } from "../../types/transaction-ui.types";

export function TransactionRowActions({
  merchantName,
  label,
  actions = [],
}: {
  readonly merchantName: string;
  readonly label: string;
  readonly actions?: readonly TransactionRowAction[];
}) {
  const actionLabel = `${label}: ${merchantName}`;

  if (actions.length === 0) {
    return (
      <button
        aria-label={actionLabel}
        className="inline-flex size-8 items-center justify-center rounded-md text-[#98a2b3] disabled:cursor-not-allowed disabled:opacity-70"
        disabled
        title={label}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={actionLabel}
          className="inline-flex size-8 items-center justify-center rounded-md text-[#53627b] transition-colors hover:bg-[#f3f5f8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          type="button"
        >
          <MoreHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
        {actions.map((action) => (
          <DropdownMenuItem
            disabled={action.disabled || !action.onSelect}
            key={action.id}
            onSelect={action.onSelect}
            className="rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
