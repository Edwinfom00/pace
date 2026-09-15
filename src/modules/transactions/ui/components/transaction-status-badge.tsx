import { cn } from "@/lib/utils";

import type { TransactionListItem } from "../../types/transaction-ui.types";

export function TransactionStatusBadge({
  status,
  postedLabel,
  pendingLabel,
}: {
  readonly status: TransactionListItem["status"];
  readonly postedLabel: string;
  readonly pendingLabel: string;
}) {
  const pending = status === "PENDING";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium leading-4",
        pending ? "bg-[#fff5ec] text-[#b6642d]" : "bg-[#eaf8f1] text-[#078652]",
      )}
    >
      {pending ? pendingLabel : postedLabel}
    </span>
  );
}
