"use client";

import { useId } from "react";
import type { IconType } from "react-icons";
import { FiChevronDown } from "react-icons/fi";

import { PaceMultiSelect, type MultiSelectOption } from "@/components/pace/forms/pace-multi-select";
import { PaceSearchSelect, type SelectOption } from "@/components/pace/forms/pace-search-select";
import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";
import { RULE_ENTRY_ORIGINS, RULE_TRANSACTION_KINDS, type RuleConditionField } from "@/modules/plans/rules/domain";
import {
  changeConditionField,
  changeConditionOperator,
  isEmptinessOperator,
  RULE_CONDITION_FIELDS,
  RULE_FIELD_OPERATORS,
  type RuleConditionDraft,
  type RuleConditionOperator,
  type RuleDraftIssue,
} from "@/modules/plans/rules/rule-draft";
import type { RuleBuilderReferences } from "@/modules/plans/rules/rules-overview";
import { cn } from "@/lib/utils";

import { ruleCategoryOptionLabel, ruleLabel } from "../rules-format";
import type { RulesUiLabels } from "../rules-ui-labels";
import { RULE_FIELD_ICONS, RuleSegmented } from "./rule-builder-visuals";

export const RULE_INPUT =
  "h-10 w-full min-w-0 rounded-[8px] border border-[#dce4ef] bg-white px-3 text-[13px] text-[#263550] outline-none placeholder:text-[#71809a] focus-visible:border-[#2867e8] focus-visible:ring-2 focus-visible:ring-[#2867e8]/15 aria-[invalid=true]:border-[#d88690]";

const FIELD_LABEL = "mb-1.5 block text-[13px] font-medium text-[#263550]";

export type RuleOption = { readonly value: string; readonly label: string };

export function ruleValueOptions(
  field: RuleConditionField,
  labels: RulesUiLabels,
  references: Pick<RuleBuilderReferences, "accounts" | "categories">,
): readonly RuleOption[] {
  switch (field) {
    case "TRANSACTION_KIND":
      return RULE_TRANSACTION_KINDS.map((kind) => ({ value: kind, label: ruleLabel(labels, `kind${kind}`) }));
    case "ENTRY_ORIGIN":
      return RULE_ENTRY_ORIGINS.map((origin) => ({ value: origin, label: ruleLabel(labels, `origin${origin}`) }));
    case "ACCOUNT":
      return references.accounts.map((account) => ({ value: account.id, label: account.name }));
    case "CATEGORY":
      return references.categories.map((category) => ({ value: category.id, label: ruleCategoryOptionLabel(category) }));
    default:
      return [];
  }
}

function valueIcon(
  field: RuleConditionField,
  value: string,
  references: Pick<RuleBuilderReferences, "categories">,
): React.ReactNode {
  if (field === "CATEGORY") {
    const category = references.categories.find((item) => item.id === value);
    return category ? (
      <TransactionIcon categoryKey={category.key} categoryName={category.name} decorative size="sm" transactionKind={category.kind} />
    ) : undefined;
  }
  if (field === "TRANSACTION_KIND") return <TransactionIcon decorative size="sm" transactionKind={value} />;
  return undefined;
}

export function RuleSelect({
  children,
  className,
  icon: Icon,
  ...props
}: React.ComponentProps<"select"> & { readonly icon?: IconType }) {
  return (
    <span className={cn("relative block min-w-0", className)}>
      {Icon ? (
        <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#526987]" />
      ) : null}
      <select className={cn(RULE_INPUT, "appearance-none pr-9", Icon && "pl-9")} {...props}>
        {children}
      </select>
      <FiChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#61708a]" />
    </span>
  );
}

export function RuleFieldError({ id, issue, labels }: { readonly id: string; readonly issue: RuleDraftIssue | null; readonly labels: RulesUiLabels }) {
  if (!issue) return null;
  return (
    <p className="mt-1.5 text-[12px] leading-5 text-[#c23445]" id={id} role="alert">
      {ruleLabel(labels, `error${issue}`)}
    </p>
  );
}

function RuleValueField({
  condition,
  describedBy,
  invalid,
  labels,
  onChange,
  references,
}: {
  readonly condition: RuleConditionDraft;
  readonly describedBy?: string;
  readonly invalid: boolean;
  readonly labels: RulesUiLabels;
  readonly onChange: (condition: RuleConditionDraft) => void;
  readonly references: Pick<RuleBuilderReferences, "accounts" | "categories">;
}) {
  const id = useId();
  if (condition.field === "COUNTERPARTY" || condition.field === "NOTE") {
    const Icon = RULE_FIELD_ICONS[condition.field];
    return (
      <div className="min-w-0">
        <label className={FIELD_LABEL} htmlFor={id}>
          {labels.value}
        </label>
        <span className="relative block">
          <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#526987]" />
          <input
            aria-describedby={describedBy ?? `${id}-hint`}
            aria-invalid={invalid || undefined}
            className={cn(RULE_INPUT, "pl-9")}
            id={id}
            maxLength={400}
            onChange={(event) => onChange({ ...condition, text: event.target.value })}
            placeholder={labels.valuePlaceholder}
            value={condition.text}
          />
        </span>
        {invalid ? null : (
          <p className="mt-1.5 text-[12px] leading-5 text-[#71809a]" id={`${id}-hint`}>
            {labels.textMatchHint}
          </p>
        )}
      </div>
    );
  }
  const known = ruleValueOptions(condition.field, labels, references);
  const knownValues = new Set(known.map((option) => option.value));
  const options: MultiSelectOption[] = [
    ...known,
    ...condition.values.filter((value) => !knownValues.has(value)).map((value) => ({ value, label: labels.unavailableReference })),
  ].map((option) => ({ ...option, icon: valueIcon(condition.field, option.value, references) }));
  return (
    <div aria-describedby={describedBy} className="min-w-0" data-invalid={invalid || undefined} role="group">
      <span className={FIELD_LABEL}>{labels.value}</span>
      <div className={cn("rounded-[9px]", invalid && "ring-1 ring-[#d88690]")}>
        <PaceMultiSelect
          ariaLabel={`${ruleLabel(labels, `field${condition.field}`)} · ${labels.value}`}
          emptyLabel={labels.noOptions}
          onValueChange={(values) => onChange({ ...condition, values })}
          options={options}
          placeholder={labels.selectValues}
          searchPlaceholder={labels.searchOptions}
          value={condition.values}
        />
      </div>
    </div>
  );
}

export function RuleConditionEditor({
  allowFieldChange,
  condition,
  issue,
  labels,
  legend,
  onChange,
  references,
  showIssue,
}: {
  readonly allowFieldChange: boolean;
  readonly condition: RuleConditionDraft;
  readonly issue: RuleDraftIssue | null;
  readonly labels: RulesUiLabels;
  readonly legend: string;
  readonly onChange: (condition: RuleConditionDraft) => void;
  readonly references: Pick<RuleBuilderReferences, "accounts" | "categories">;
  readonly showIssue: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const visibleIssue = showIssue ? issue : null;
  const operators = RULE_FIELD_OPERATORS[condition.field];
  const fieldOptions: SelectOption<RuleConditionField>[] = RULE_CONDITION_FIELDS.map((field) => {
    const Icon = RULE_FIELD_ICONS[field];
    return {
      value: field,
      label: ruleLabel(labels, `field${field}`),
      icon: (
        <span aria-hidden className="grid size-6 place-items-center rounded-[6px] bg-[#f2f5f9] text-[#40577d]">
          <Icon className="size-3.5" />
        </span>
      ),
    };
  });
  return (
    <fieldset className="min-w-0 space-y-3" data-condition-field={condition.field} data-condition-key={condition.key}>
      <legend className="sr-only">{legend}</legend>
      {allowFieldChange ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <span className={FIELD_LABEL}>{labels.field}</span>
            <PaceSearchSelect
              ariaLabel={`${legend} · ${labels.field}`}
              onValueChange={(field) => onChange(changeConditionField(condition, field))}
              options={fieldOptions}
              placeholder={labels.field}
              searchPlaceholder={labels.searchOptions}
              triggerClassName="h-10 rounded-[8px] px-3 text-[13px] font-normal"
              value={condition.field}
            />
          </div>
          <label className="min-w-0">
            <span className={FIELD_LABEL}>{labels.operator}</span>
            <RuleSelect
              onChange={(event) => onChange(changeConditionOperator(condition, event.target.value as RuleConditionOperator))}
              value={condition.operator}
            >
              {operators.map((operator) => (
                <option key={operator} value={operator}>
                  {ruleLabel(labels, `op${operator}`)}
                </option>
              ))}
            </RuleSelect>
          </label>
        </div>
      ) : operators.length > 1 ? (
        <RuleSegmented
          label={labels.operator}
          onChange={(operator) => onChange(changeConditionOperator(condition, operator))}
          options={operators.map((operator) => ({ value: operator, label: ruleLabel(labels, `op${operator}`) }))}
          value={condition.operator}
        />
      ) : null}
      {isEmptinessOperator(condition.operator) ? null : (
        <RuleValueField
          condition={condition}
          describedBy={visibleIssue ? errorId : undefined}
          invalid={Boolean(visibleIssue)}
          labels={labels}
          onChange={onChange}
          references={references}
        />
      )}
      <RuleFieldError id={errorId} issue={visibleIssue} labels={labels} />
    </fieldset>
  );
}
