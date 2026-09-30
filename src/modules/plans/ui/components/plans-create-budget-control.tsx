"use client";

import { useState } from "react";
import { FiPlus } from "react-icons/fi";

import type { PlansUiLabels } from "../plans-ui-labels";
import { BudgetCreateDialogShell } from "./budget-create-dialog-shell";

export function PlansCreateBudgetControl({
  labels,
}: {
  readonly labels: PlansUiLabels;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#2867e8] px-3 text-[13px] font-medium text-white hover:bg-[#1e55d1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        onClick={() => setOpen(true)}
        type="button">
        <FiPlus className="size-4" />
        {labels.newPlan}
      </button>
      <BudgetCreateDialogShell
        labels={labels.createBudget}
        onOpenChange={setOpen}
        open={open}
      />
    </>
  );
}
