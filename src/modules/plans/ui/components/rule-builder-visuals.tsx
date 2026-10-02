"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import type { IconType } from "react-icons";
import {
  FiCreditCard,
  FiDownloadCloud,
  FiFileText,
  FiHelpCircle,
  FiInfo,
  FiShoppingBag,
  FiShuffle,
  FiTag,
  FiTarget,
} from "react-icons/fi";

import type { RuleConditionField } from "@/modules/plans/rules/domain";
import {
  conditionDraftIssue,
  conditionDraftToCondition,
  parseRulePriority,
  type RuleDraft,
  type RuleTriggerPresetId,
} from "@/modules/plans/rules/rule-draft";
import { MIN_RULE_PRIORITY } from "@/modules/plans/rules/rule-contract";
import {
  toRuleConditionView,
  type RuleBuilderReferences,
  type RuleListItem,
  type RuleReferenceNames,
} from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { conditionSummary, fillLabel, ruleLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import { RuleActionIcon, RuleStatusPill } from "./rule-visuals";

export const RULE_TRIGGER_ICONS: Readonly<Record<RuleTriggerPresetId, IconType>> = {
  MERCHANT_CONTAINS: FiShoppingBag,
  MERCHANT_EQUALS: FiTarget,
  MERCHANT_EMPTY: FiHelpCircle,
  ACCOUNT_IS: FiCreditCard,
  TRANSACTION_KIND_IS: FiShuffle,
  NOTE_CONTAINS: FiFileText,
  CATEGORY_EMPTY: FiTag,
  SOURCE_IS: FiDownloadCloud,
};

export const RULE_FIELD_ICONS: Readonly<Record<RuleConditionField, IconType>> = {
  COUNTERPARTY: FiShoppingBag,
  NOTE: FiFileText,
  ACCOUNT: FiCreditCard,
  TRANSACTION_KIND: FiShuffle,
  CATEGORY: FiTag,
  ENTRY_ORIGIN: FiDownloadCloud,
};

export function RuleIconTile({ icon: Icon, selected = false }: { readonly icon: IconType; readonly selected?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-[9px] border transition-colors",
        selected ? "border-[#cfe0fb] bg-[#eaf2ff] text-[#1769e8]" : "border-[#e6ebf2] bg-[#f6f8fb] text-[#40577d]",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function RuleSectionTitle({ hint, id, title }: { readonly hint?: string; readonly id?: string; readonly title: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-[15px] font-semibold tracking-tight text-[#14213c]" id={id}>
        {title}
      </h4>
      {hint ? <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">{hint}</p> : null}
    </div>
  );
}

export function RuleInfoCallout({
  children,
  icon: Icon = FiInfo,
  title,
}: {
  readonly children: ReactNode;
  readonly icon?: IconType;
  readonly title?: string;
}) {
  return (
    <div className="flex gap-3 rounded-[10px] bg-[#edf4ff] px-3.5 py-3 text-[12px] leading-5 text-[#526987]">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[#2867e8]" />
      <div className="min-w-0">
        {title ? <p className="font-semibold text-[#1c5fd6]">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export type RuleSegmentOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly icon?: IconType;
};

export function RuleSegmented<T extends string>({
  label,
  labelHidden = false,
  onChange,
  options,
  size = "md",
  value,
}: {
  readonly label: string;
  readonly labelHidden?: boolean;
  readonly onChange: (value: T) => void;
  readonly options: readonly RuleSegmentOption<T>[];
  readonly size?: "md" | "lg";
  readonly value: T;
}) {
  const id = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const values = options.map((option) => option.value);
    const index = values.indexOf(value);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? values.length - 1
          : (index + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + values.length) % values.length;
    const next = values[nextIndex]!;
    onChange(next);
    document.getElementById(`${id}-${nextIndex}`)?.focus();
  };
  return (
    <div className="min-w-0">
      <span className={cn("mb-1.5 block text-[13px] font-medium text-[#263550]", labelHidden && "sr-only")} id={`${id}-label`}>
        {label}
      </span>
      <div
        aria-labelledby={`${id}-label`}
        className={cn(
          "flex min-w-0 gap-1 overflow-x-auto rounded-[10px] border border-[#dce4ef] bg-[#f6f8fb] p-1",
          size === "lg" && "rounded-[12px]",
        )}
        role="radiogroup"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const Icon = option.icon;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-[7px] border px-3 text-[13px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2867e8]",
                size === "lg" ? "h-11 rounded-[9px] text-[14px]" : "h-8",
                selected
                  ? "border-[#bcd3fb] bg-[#e8f1ff] font-semibold text-[#2867e8]"
                  : "border-transparent font-medium text-[#53627b] hover:bg-white hover:text-[#263550]",
              )}
              data-value={option.value}
              id={`${id}-${index}`}
              key={option.value}
              onClick={() => onChange(option.value)}
              onKeyDown={onKeyDown}
              role="radio"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {Icon ? <Icon aria-hidden className="size-4" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RuleToggleRow({
  checked,
  description,
  onChange,
  title,
}: {
  readonly checked: boolean;
  readonly description: string;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        aria-checked={checked}
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2867e8]",
          checked ? "bg-[#2867e8]" : "bg-[#d5dde8]",
        )}
        data-rule-enabled-switch
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow-[0_1px_3px_rgb(15_23_42/25%)] transition-transform motion-reduce:transition-none",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </button>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#14213c]" id={`${id}-title`}>
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]" id={`${id}-description`}>
          {description}
        </p>
      </div>
    </div>
  );
}

export function RulePreviewPanel({
  draft,
  editingRule,
  labels,
  name,
  names,
  references,
}: {
  readonly draft: RuleDraft;
  readonly editingRule: RuleListItem | null;
  readonly labels: RulesUiLabels;
  readonly name: string;
  readonly names: RuleReferenceNames;
  readonly references: RuleBuilderReferences;
}) {
  const id = useId();
  const category = references.categories.find((item) => item.id === draft.action.categoryId);
  const action =
    draft.action.type === "ROUTE_FOR_REVIEW"
      ? ({ type: "ROUTE_FOR_REVIEW" } as const)
      : ({
          type: "ASSIGN_CATEGORY",
          categoryId: draft.action.categoryId,
          categoryName: category?.name ?? null,
          categoryKey: category?.key ?? null,
        } as const);
  const summary = (condition: RuleDraft["trigger"]) =>
    conditionDraftIssue(condition)
      ? labels.sentencePending
      : conditionSummary(labels, toRuleConditionView(conditionDraftToCondition(condition), names));
  const triggerSummary = summary(draft.trigger);
  const priority = parseRulePriority(draft.priority);
  const target =
    action.type === "ROUTE_FOR_REVIEW" ? labels.needsReview : (action.categoryName ?? labels.sentencePending);
  const row = "flex items-start justify-between gap-4 py-1.5";
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0" data-rule-preview>
      <h4 className="text-[15px] font-semibold tracking-tight text-[#14213c]" id={`${id}-title`}>
        {labels.previewLabel}
      </h4>
      <div className="mt-4 rounded-[10px] border border-[#e3e9f2] bg-white p-4">
        <div className="flex items-center gap-3">
          <RuleActionIcon action={action} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-[#14213c]">{name || labels.newRuleTitle}</p>
            <p className="mt-0.5 line-clamp-2 text-[12px] text-[#71809a]">{triggerSummary}</p>
          </div>
        </div>
        <dl className="mt-4 divide-y divide-[#f0f3f7] text-[12px]">
          <div className={row} data-review="trigger">
            <dt className="shrink-0 text-[#71809a]">{labels.trigger}</dt>
            <dd className="min-w-0 text-right font-medium text-[#263550]">
              <span className="block text-[11px] font-normal text-[#8a97ad]">{labels.triggerEvent}</span>
              {triggerSummary}
            </dd>
          </div>
          <div className={row} data-review="conditions">
            <dt className="shrink-0 text-[#71809a]">{labels.conditions}</dt>
            <dd className="min-w-0 text-right font-medium text-[#263550]">
              {draft.conditions.length ? (
                <ul className="space-y-0.5">
                  {draft.conditions.map((condition) => (
                    <li key={condition.key}>{summary(condition)}</li>
                  ))}
                </ul>
              ) : (
                <span className="font-normal text-[#8a97ad]">{labels.noConditions}</span>
              )}
            </dd>
          </div>
          <div className={row} data-review="action">
            <dt className="shrink-0 text-[#71809a]">{labels.action}</dt>
            <dd className="min-w-0 text-right font-medium text-[#263550]">
              {ruleLabel(labels, `action${draft.action.type}`)} · {target}
            </dd>
          </div>
          <div className={row} data-review="priority">
            <dt className="shrink-0 text-[#71809a]">{labels.priority}</dt>
            <dd className="text-right font-medium text-[#263550] tabular-nums">
              {priority === null ? "—" : priority === MIN_RULE_PRIORITY ? fillLabel(labels.priorityHighest, { priority }) : priority}
            </dd>
          </div>
          <div className={row} data-enabled={draft.enabled} data-review="enabled">
            <dt className="shrink-0 text-[#71809a]">{labels.enabledState}</dt>
            <dd className="flex min-w-0 justify-end">
              {editingRule ? (
                <RuleStatusPill labels={labels} status={editingRule.status} />
              ) : (
                <RuleStatusPill labels={labels} status={draft.enabled ? "ACTIVE" : "PAUSED"} />
              )}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-4">
        <RuleInfoCallout>{labels.noMoneyMovement}</RuleInfoCallout>
      </div>
    </section>
  );
}
