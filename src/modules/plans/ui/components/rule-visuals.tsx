import { FiInbox } from "react-icons/fi";

import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import type { RuleExecutionView, RuleListItem } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { outcomeLabel, statusLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";

export function RuleActionIcon({
  action,
  size = "sm",
  muted = false,
}: {
  readonly action: RuleListItem["action"];
  readonly size?: "sm" | "md" | "lg";
  readonly muted?: boolean;
}) {
  const className = muted ? "opacity-60 grayscale" : undefined;
  if (action.type === "ROUTE_FOR_REVIEW") {
    return (
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center border border-white/80 bg-[#fff4e0] text-[#c27100]",
          size === "sm" ? "size-8 rounded-[9px]" : size === "md" ? "size-9 rounded-[10px]" : "size-11 rounded-[12px]",
          className,
        )}
      >
        <FiInbox className={size === "lg" ? "size-5" : "size-4"} />
      </span>
    );
  }
  return (
    <TransactionIcon
      categoryKey={action.categoryKey}
      categoryName={action.categoryName}
      className={className}
      size={size}
    />
  );
}

const STATUS_TONES: Record<RuleListItem["status"], string> = {
  ACTIVE: "bg-[#e8f7ef] text-[#14845c]",
  PAUSED: "bg-[#f1f4f8] text-[#53627b]",
  ARCHIVED: "bg-[#f4f1ec] text-[#7a6a55]",
};

export function RuleStatusPill({
  labels,
  status,
}: {
  readonly labels: RulesUiLabels;
  readonly status: RuleListItem["status"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        STATUS_TONES[status],
      )}
      data-status={status}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {statusLabel(labels, status)}
    </span>
  );
}

const OUTCOME_TONES: Record<RuleExecutionView["outcome"], string> = {
  APPLIED: "bg-[#e8f7ef] text-[#14845c]",
  SKIPPED: "bg-[#f1f4f8] text-[#53627b]",
  SHADOWED: "bg-[#f1ecff] text-[#6a4cc4]",
  FAILED: "bg-[#fdecee] text-[#c23445]",
  PENDING: "bg-[#eef4ff] text-[#2f6fd6]",
};

export function RuleOutcomePill({
  execution,
  labels,
}: {
  readonly execution: Pick<RuleExecutionView, "outcome" | "actionType">;
  readonly labels: RulesUiLabels;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2 py-1 text-[11px] font-semibold whitespace-nowrap",
        OUTCOME_TONES[execution.outcome],
      )}
      data-outcome={execution.outcome}
    >
      {outcomeLabel(labels, execution)}
    </span>
  );
}
