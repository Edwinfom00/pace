import { FiChevronRight } from "react-icons/fi";

import type { RuleListItem } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import {
  actionLabel,
  actionTarget,
  conditionLabel,
  conditionSummary,
  fillLabel,
  formatRuleDate,
  formatRuleTime,
} from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import { RuleActionIcon, RuleStatusPill } from "./rule-visuals";

type RulesListProps = {
  readonly rules: readonly RuleListItem[];
  readonly selectedId: string | null;
  readonly onSelect: (ruleId: string) => void;
  readonly labels: RulesUiLabels;
  readonly locale: string;
  readonly timeZone: string;
};

function ruleSubtitle(labels: RulesUiLabels, rule: RuleListItem): string {
  return rule.trigger ? conditionSummary(labels, rule.trigger) : labels.triggerEvent;
}

export function RulesTable({ rules, selectedId, onSelect, labels, locale, timeZone }: RulesListProps) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#e5eaf1] bg-white">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">{labels.title}</caption>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[15%]" />
          <col className="w-[17%]" />
          <col className="w-[11%]" />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-[#edf0f4] text-[11px] font-semibold text-[#53627b]">
            <th className="px-4 py-3" scope="col">{labels.colRule}</th>
            <th className="px-3 py-3" scope="col">{labels.colTrigger}</th>
            <th className="px-3 py-3" scope="col">{labels.colAction}</th>
            <th className="px-3 py-3" scope="col">{labels.colStatus}</th>
            <th className="px-3 py-3 text-center" scope="col">{labels.colPriority}</th>
            <th className="px-3 py-3 text-center" scope="col">{labels.colApplied}</th>
            <th className="px-3 py-3" scope="col">{labels.colLastApplied}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf0f4]">
          {rules.map((rule) => {
            const selected = rule.id === selectedId;
            return (
              <tr
                className={cn(
                  "cursor-pointer transition-colors hover:bg-[#f7faff]",
                  selected && "bg-[#f3f7ff] shadow-[inset_3px_0_0_#2867e8] hover:bg-[#f3f7ff]",
                )}
                data-rule-id={rule.id}
                data-selected={selected || undefined}
                key={rule.id}
                onClick={() => onSelect(rule.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <RuleActionIcon action={rule.action} muted={rule.status !== "ACTIVE"} />
                    <span className="min-w-0">
                      <button
                        aria-current={selected || undefined}
                        className="block max-w-full truncate rounded-lg text-left text-[13px] font-semibold text-[#18243b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(rule.id);
                        }}
                        type="button"
                      >
                        {rule.name}
                      </button>
                      <span className="block truncate text-[11px] text-[#71809a]">{ruleSubtitle(labels, rule)}</span>
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3">
                  {rule.trigger ? (
                    <span className="inline-block max-w-full truncate rounded-[6px] bg-[#f2f5f9] px-2 py-1 text-[11px] font-medium text-[#40506b]">
                      {conditionLabel(labels, rule.trigger)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3">
                  <span className="block truncate text-[12px] font-medium text-[#18243b]">
                    {actionLabel(labels, rule.action)}
                  </span>
                  <span className="block truncate text-[11px] text-[#71809a]">{actionTarget(labels, rule.action)}</span>
                </td>
                <td className="px-3 py-3">
                  <RuleStatusPill labels={labels} status={rule.status} />
                </td>
                <td className="px-3 py-3 text-center text-[12px] text-[#34425c] tabular-nums">{rule.priority}</td>
                <td className="px-3 py-3 text-center text-[12px] text-[#34425c] tabular-nums">{rule.appliedCount}</td>
                <td className="px-3 py-3 text-[12px] text-[#34425c] tabular-nums">
                  {rule.lastAppliedAt ? (
                    <>
                      <span className="block">{formatRuleDate(rule.lastAppliedAt, locale, timeZone)}</span>
                      <span className="block text-[11px] text-[#71809a]">
                        {formatRuleTime(rule.lastAppliedAt, locale, timeZone)}
                      </span>
                    </>
                  ) : (
                    <span aria-label={labels.neverApplied} className="text-[#8a97ad]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RulesCardList({ rules, selectedId, onSelect, labels }: Omit<RulesListProps, "locale" | "timeZone">) {
  return (
    <ul className="divide-y divide-[#edf0f4] overflow-hidden rounded-[14px] border border-[#e5eaf1] bg-white">
      {rules.map((rule) => (
        <li key={rule.id}>
          <button
            aria-current={rule.id === selectedId || undefined}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2867e8]"
            data-rule-id={rule.id}
            onClick={() => onSelect(rule.id)}
            type="button"
          >
            <RuleActionIcon action={rule.action} muted={rule.status !== "ACTIVE"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[#18243b]">{rule.name}</span>
              <span className="block truncate text-[11px] text-[#71809a]">
                {rule.trigger ? conditionLabel(labels, rule.trigger) : labels.triggerEvent}
                {" · "}
                {fillLabel(labels.appliedCount, { count: rule.appliedCount })}
              </span>
            </span>
            <RuleStatusPill labels={labels} status={rule.status} />
            <FiChevronRight aria-hidden className="size-4 shrink-0 text-[#8a97ad]" />
          </button>
        </li>
      ))}
    </ul>
  );
}
