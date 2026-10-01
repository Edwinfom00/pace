"use client";

import { useState } from "react";
import { FiTarget } from "react-icons/fi";
import type { PlansUiLabels } from "../plans-ui-labels";
import type { BudgetIconKey } from "./budget-icon-picker";
import { SavingsGoalCreateDialog } from "./savings-goal-create-dialog";

export function PlansCreateSavingsGoalControl(props: {
  readonly currency: string;
  readonly labels: PlansUiLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const budgetLabels = props.labels.createBudget;
  const iconLabels = Object.fromEntries(
    (["food", "transport", "shopping", "home", "health", "entertainment", "subscriptions", "bills", "education", "travel", "other"] as const).map((key) => [key, budgetLabels[`icon${key[0].toUpperCase()}${key.slice(1)}`] ?? key]),
  ) as Record<BudgetIconKey, string>;
  return (
    <>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#c9d8f3] px-3 text-[13px] font-medium text-[#2867e8] hover:bg-[#edf4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        type="button"
        onClick={() => setOpen(true)}>
        <FiTarget className="size-4" />
        {props.labels.createSavingsGoal.create}
      </button>
      <SavingsGoalCreateDialog
        {...props}
        iconLabels={iconLabels}
        labels={props.labels.createSavingsGoal}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}
