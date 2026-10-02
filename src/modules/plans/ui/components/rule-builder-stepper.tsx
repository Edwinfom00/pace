import { FiCheck } from "react-icons/fi";

import { RULE_BUILDER_STEPS, type RuleBuilderStep } from "@/modules/plans/rules/rule-draft";
import { cn } from "@/lib/utils";

import { fillLabel, ruleLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";

export function RuleBuilderStepper({
  current,
  disabled = false,
  labels,
  onSelect,
  reachable,
  completed,
}: {
  readonly current: RuleBuilderStep;
  readonly disabled?: boolean;
  readonly labels: RulesUiLabels;
  readonly onSelect: (step: RuleBuilderStep) => void;
  readonly reachable: ReadonlySet<RuleBuilderStep>;
  readonly completed: ReadonlySet<RuleBuilderStep>;
}) {
  const currentIndex = RULE_BUILDER_STEPS.indexOf(current);
  return (
    <nav aria-label={labels.stepper} data-rule-stepper>
      <p aria-live="polite" className="sr-only">
        {fillLabel(labels.stepProgress, { current: currentIndex + 1, total: RULE_BUILDER_STEPS.length })}
      </p>
      <ol className="flex items-center gap-2">
        {RULE_BUILDER_STEPS.map((step, index) => {
          const active = step === current;
          const done = completed.has(step) && !active;
          const canSelect = !disabled && !active && reachable.has(step);
          return (
            <li className="flex min-w-0 flex-1 items-center gap-2 last:flex-none" key={step}>
              <button
                aria-current={active ? "step" : undefined}
                className={cn(
                  "group flex min-w-0 items-center gap-2 rounded-[8px] py-1 pr-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]",
                  canSelect ? "cursor-pointer" : "cursor-default",
                )}
                data-step={step}
                data-step-state={active ? "current" : done ? "complete" : "upcoming"}
                disabled={!canSelect}
                onClick={() => onSelect(step)}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors",
                    active && "bg-[#2867e8] text-white",
                    done && "bg-[#e7f0ff] text-[#2867e8]",
                    !active && !done && "border border-[#d9e1ec] bg-white text-[#71809a]",
                    canSelect && !done && "group-hover:border-[#2867e8]",
                  )}
                >
                  {done ? <FiCheck className="size-3.5" /> : index + 1}
                </span>
                <span className={cn("min-w-0", active ? "block" : "hidden sm:block")}>
                  <span className={cn("block truncate text-[13px] font-semibold", active ? "text-[#14213c]" : "text-[#53627b]")}>
                    {ruleLabel(labels, `step${step}`)}
                  </span>
                  <span className="hidden truncate text-[11px] text-[#71809a] lg:block">{ruleLabel(labels, `stepHint${step}`)}</span>
                  <span className="sr-only">
                    {active ? `, ${labels.stepCurrent}` : done ? `, ${labels.stepCompleted}` : ""}
                  </span>
                </span>
              </button>
              {index < RULE_BUILDER_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn("h-px min-w-3 flex-1 rounded-full", index < currentIndex ? "bg-[#2867e8]" : "bg-[#e1e7f0]")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
