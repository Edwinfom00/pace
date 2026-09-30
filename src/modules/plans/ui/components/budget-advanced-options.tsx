import type { BudgetFrequency } from "@/modules/plans/domain";

export type BudgetAdvancedOptionsLabels = Readonly<{
  monthlyResetTitle: string;
  monthlyResetHint: string;
}>;

export function BudgetAdvancedOptions({
  frequency,
  labels,
}: {
  readonly frequency: BudgetFrequency;
  readonly labels: BudgetAdvancedOptionsLabels;
}) {
  if (frequency !== "MONTHLY") return null;

  return (
    <div className="mt-3" data-testid="budget-advanced-options">
      <div className="flex min-w-0 items-start gap-3 rounded-[8px] bg-[#f8faff] px-3 py-2.5">
        <span
          aria-hidden="true"
          className="mt-1 size-2 shrink-0 rounded-full bg-[#2867e8]"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#263550]">
            {labels.monthlyResetTitle}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
            {labels.monthlyResetHint}
          </p>
        </div>
      </div>
    </div>
  );
}
