import type { RuleExecutionView, RuleConditionView, RuleListItem } from "@/modules/plans/rules/rules-overview";
import { fillLabel } from "@/modules/forecast/ui/forecast-format";

import type { RulesUiLabels } from "./rules-ui-labels";

export { fillLabel };

function label(labels: RulesUiLabels, key: string): string | undefined {
  return (labels as Readonly<Record<string, string>>)[key];
}

export function conditionLabel(labels: RulesUiLabels, condition: RuleConditionView): string {
  const field = label(labels, `field${condition.field}`) ?? condition.field;
  const operator = label(labels, `op${condition.operator}`) ?? condition.operator;
  return `${field} ${operator}`;
}

export function conditionValue(labels: RulesUiLabels, condition: RuleConditionView): string | null {
  if (condition.operator === "IS_EMPTY" || condition.operator === "IS_NOT_EMPTY") return null;
  const values = condition.values.map((value) => {
    if (value === null) return labels.unavailableReference;
    if (condition.field === "TRANSACTION_KIND") return label(labels, `kind${value}`) ?? value;
    if (condition.field === "ENTRY_ORIGIN") return label(labels, `origin${value}`) ?? value;
    return value;
  });
  return values.length ? values.join(", ") : null;
}

export function conditionSummary(labels: RulesUiLabels, condition: RuleConditionView): string {
  const value = conditionValue(labels, condition);
  return value ? `${conditionLabel(labels, condition)} “${value}”` : conditionLabel(labels, condition);
}

export function actionLabel(labels: RulesUiLabels, action: RuleListItem["action"]): string {
  return label(labels, `action${action.type}`) ?? action.type;
}

export function actionTarget(labels: RulesUiLabels, action: RuleListItem["action"]): string {
  if (action.type === "ROUTE_FOR_REVIEW") return labels.needsReview;
  return action.categoryName ?? labels.unavailableReference;
}

export function statusLabel(labels: RulesUiLabels, status: RuleListItem["status"] | "ALL"): string {
  return label(labels, `status${status}`) ?? status;
}

export function outcomeLabel(labels: RulesUiLabels, execution: Pick<RuleExecutionView, "outcome" | "actionType">): string {
  const key =
    execution.outcome === "APPLIED" ? `outcomeAPPLIED_${execution.actionType}` : `outcome${execution.outcome}`;
  return label(labels, key) ?? execution.outcome;
}

export function formatRuleDate(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone }).format(
    new Date(value),
  );
}

export function formatRuleTime(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}

export function createdByLabel(labels: RulesUiLabels, rule: Pick<RuleListItem, "createdByActor" | "origin">): string {
  if (rule.origin === "AGENT") return labels.byPace;
  return rule.createdByActor ? labels.byYou : labels.byMember;
}

export function ruleLabel(labels: RulesUiLabels, key: string): string {
  return label(labels, key) ?? key;
}

export function ruleCategoryOptionLabel(category: { readonly name: string; readonly parentName: string | null }): string {
  return category.parentName ? `${category.parentName} › ${category.name}` : category.name;
}
