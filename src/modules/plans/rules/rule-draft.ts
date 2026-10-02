import {
  RULE_ENTRY_ORIGINS,
  RULE_OPTIONAL_SET_OPERATORS,
  RULE_SET_OPERATORS,
  RULE_TEXT_OPERATORS,
  RULE_TRANSACTION_KINDS,
  type RuleAction,
  type RuleActionType,
  type RuleCondition,
  type RuleConditionField,
  type RuleDefinition,
} from "./domain";
import {
  MAX_RULE_CONDITIONS,
  MAX_RULE_CONDITION_VALUES,
  MAX_RULE_PRIORITY,
  MAX_RULE_TEXT_LENGTH,
  MIN_RULE_PRIORITY,
  normalizeRuleText,
  ruleDefinitionSchema,
  type CreateRuleCommand,
  type UpdateRuleCommand,
} from "./rule-contract";
import { splitRuleTrigger } from "./rules-overview";

export const RULE_BUILDER_STEPS = ["TRIGGER", "CONDITIONS", "ACTION", "REVIEW"] as const;
export type RuleBuilderStep = (typeof RULE_BUILDER_STEPS)[number];

export const RULE_CONDITION_FIELDS = [
  "COUNTERPARTY",
  "NOTE",
  "ACCOUNT",
  "TRANSACTION_KIND",
  "CATEGORY",
  "ENTRY_ORIGIN",
] as const satisfies readonly RuleConditionField[];

export type RuleConditionOperator = RuleCondition["operator"];

export const RULE_FIELD_OPERATORS: Readonly<Record<RuleConditionField, readonly RuleConditionOperator[]>> = {
  COUNTERPARTY: RULE_TEXT_OPERATORS,
  NOTE: RULE_TEXT_OPERATORS,
  ACCOUNT: RULE_SET_OPERATORS,
  TRANSACTION_KIND: RULE_SET_OPERATORS,
  CATEGORY: RULE_OPTIONAL_SET_OPERATORS,
  ENTRY_ORIGIN: RULE_SET_OPERATORS,
};

export const RULE_TRIGGER_PRESETS = [
  { id: "MERCHANT_CONTAINS", field: "COUNTERPARTY", operator: "CONTAINS" },
  { id: "MERCHANT_EQUALS", field: "COUNTERPARTY", operator: "EQUALS" },
  { id: "MERCHANT_EMPTY", field: "COUNTERPARTY", operator: "IS_EMPTY" },
  { id: "ACCOUNT_IS", field: "ACCOUNT", operator: "IS_ONE_OF" },
  { id: "TRANSACTION_KIND_IS", field: "TRANSACTION_KIND", operator: "IS_ONE_OF" },
  { id: "NOTE_CONTAINS", field: "NOTE", operator: "CONTAINS" },
  { id: "CATEGORY_EMPTY", field: "CATEGORY", operator: "IS_EMPTY" },
  { id: "SOURCE_IS", field: "ENTRY_ORIGIN", operator: "IS_ONE_OF" },
] as const satisfies readonly {
  readonly id: string;
  readonly field: RuleConditionField;
  readonly operator: RuleConditionOperator;
}[];
export type RuleTriggerPreset = (typeof RULE_TRIGGER_PRESETS)[number];
export type RuleTriggerPresetId = RuleTriggerPreset["id"];

export type RuleConditionDraft = {
  readonly key: string;
  readonly field: RuleConditionField;
  readonly operator: RuleConditionOperator;
  readonly text: string;
  readonly values: readonly string[];
};

export type RuleActionDraft = {
  readonly type: RuleActionType;
  readonly categoryId: string;
};

export type RuleDraft = {
  readonly trigger: RuleConditionDraft;
  readonly conditions: readonly RuleConditionDraft[];
  readonly action: RuleActionDraft;
  readonly name: string;
  readonly nameEdited: boolean;
  readonly priority: string;
  readonly enabled: boolean;
};

export type RuleDraftIssue =
  | "VALUE_REQUIRED"
  | "SELECTION_REQUIRED"
  | "TEXT_TOO_LONG"
  | "TOO_MANY_VALUES"
  | "TOO_MANY_CONDITIONS"
  | "CATEGORY_REQUIRED"
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "PRIORITY_INVALID";

export type RuleDraftIssues = {
  readonly trigger: RuleDraftIssue | null;
  readonly conditions: Readonly<Record<string, RuleDraftIssue>>;
  readonly conditionsLimit: RuleDraftIssue | null;
  readonly action: RuleDraftIssue | null;
  readonly name: RuleDraftIssue | null;
  readonly priority: RuleDraftIssue | null;
};

let draftKeySequence = 0;
function nextKey(): string {
  draftKeySequence += 1;
  return `condition-${draftKeySequence}`;
}

export function isTextOperator(operator: RuleConditionOperator): boolean {
  return operator === "EQUALS" || operator === "CONTAINS" || operator === "STARTS_WITH";
}

export function isEmptinessOperator(operator: RuleConditionOperator): boolean {
  return operator === "IS_EMPTY" || operator === "IS_NOT_EMPTY";
}

export function conditionDraftFor(
  field: RuleConditionField,
  operator: RuleConditionOperator = RULE_FIELD_OPERATORS[field][0]!,
): RuleConditionDraft {
  return { key: nextKey(), field, operator, text: "", values: [] };
}

export function changeConditionField(draft: RuleConditionDraft, field: RuleConditionField): RuleConditionDraft {
  if (draft.field === field) return draft;
  return { ...conditionDraftFor(field), key: draft.key };
}

export function changeConditionOperator(
  draft: RuleConditionDraft,
  operator: RuleConditionOperator,
): RuleConditionDraft {
  if (!RULE_FIELD_OPERATORS[draft.field].includes(operator)) return draft;
  return { ...draft, operator };
}

export function applyTriggerPreset(draft: RuleConditionDraft, preset: RuleTriggerPreset): RuleConditionDraft {
  const sameField = draft.field === preset.field;
  return {
    key: draft.key,
    field: preset.field,
    operator: preset.operator,
    text: sameField ? draft.text : "",
    values: sameField ? draft.values : [],
  };
}

export function triggerPresetFor(draft: Pick<RuleConditionDraft, "field" | "operator">): RuleTriggerPreset | null {
  return (
    RULE_TRIGGER_PRESETS.find((preset) => preset.field === draft.field && preset.operator === draft.operator) ??
    RULE_TRIGGER_PRESETS.find((preset) => preset.field === draft.field) ??
    null
  );
}

export function createEmptyRuleDraft(suggestedPriority: number): RuleDraft {
  return {
    trigger: conditionDraftFor("COUNTERPARTY", "CONTAINS"),
    conditions: [],
    action: { type: "ASSIGN_CATEGORY", categoryId: "" },
    name: "",
    nameEdited: false,
    priority: String(clampPriority(suggestedPriority)),
    enabled: true,
  };
}

function conditionToDraft(condition: RuleCondition): RuleConditionDraft {
  if (condition.field === "COUNTERPARTY" || condition.field === "NOTE")
    return { key: nextKey(), field: condition.field, operator: condition.operator, text: condition.value ?? "", values: [] };
  return { key: nextKey(), field: condition.field, operator: condition.operator, text: "", values: [...condition.values] };
}

export function ruleDraftFromRule(rule: {
  readonly name: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly definition: Pick<RuleDefinition, "conditions" | "action">;
}): RuleDraft {
  const { trigger, rest } = splitRuleTrigger(rule.definition.conditions);
  return {
    trigger: trigger ? conditionToDraft(trigger) : conditionDraftFor("COUNTERPARTY", "CONTAINS"),
    conditions: rest.map(conditionToDraft),
    action:
      rule.definition.action.type === "ASSIGN_CATEGORY"
        ? { type: "ASSIGN_CATEGORY", categoryId: rule.definition.action.categoryId }
        : { type: "ROUTE_FOR_REVIEW", categoryId: "" },
    name: rule.name,
    nameEdited: true,
    priority: String(rule.priority),
    enabled: rule.enabled,
  };
}

export function clampPriority(value: number): number {
  if (!Number.isFinite(value)) return MIN_RULE_PRIORITY;
  return Math.min(MAX_RULE_PRIORITY, Math.max(MIN_RULE_PRIORITY, Math.trunc(value)));
}

export function suggestRulePriority(priorities: readonly number[]): number {
  return clampPriority(priorities.length ? Math.max(...priorities) + 1 : MIN_RULE_PRIORITY);
}

export function parseRulePriority(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= MIN_RULE_PRIORITY && parsed <= MAX_RULE_PRIORITY ? parsed : null;
}

export function conditionDraftIssue(draft: RuleConditionDraft): RuleDraftIssue | null {
  if (isEmptinessOperator(draft.operator)) return null;
  if (draft.field === "COUNTERPARTY" || draft.field === "NOTE") {
    const normalized = normalizeRuleText(draft.text);
    if (!normalized) return "VALUE_REQUIRED";
    if (normalized.length > MAX_RULE_TEXT_LENGTH) return "TEXT_TOO_LONG";
    return null;
  }
  if (!draft.values.length) return "SELECTION_REQUIRED";
  if (draft.values.length > MAX_RULE_CONDITION_VALUES) return "TOO_MANY_VALUES";
  return null;
}

export function conditionDraftToCondition(draft: RuleConditionDraft): RuleCondition {
  const values = [...new Set(draft.values)].sort();
  switch (draft.field) {
    case "COUNTERPARTY":
    case "NOTE":
      return isEmptinessOperator(draft.operator)
        ? { field: draft.field, operator: draft.operator as "IS_EMPTY" | "IS_NOT_EMPTY", value: null }
        : { field: draft.field, operator: draft.operator as "EQUALS" | "CONTAINS" | "STARTS_WITH", value: normalizeRuleText(draft.text) };
    case "CATEGORY":
      return isEmptinessOperator(draft.operator)
        ? { field: "CATEGORY", operator: draft.operator as "IS_EMPTY" | "IS_NOT_EMPTY", values: [] }
        : { field: "CATEGORY", operator: draft.operator as "IS_ONE_OF" | "IS_NOT_ONE_OF", values };
    case "TRANSACTION_KIND":
      return {
        field: "TRANSACTION_KIND",
        operator: draft.operator as "IS_ONE_OF" | "IS_NOT_ONE_OF",
        values: values.filter((value): value is (typeof RULE_TRANSACTION_KINDS)[number] =>
          (RULE_TRANSACTION_KINDS as readonly string[]).includes(value),
        ),
      };
    case "ENTRY_ORIGIN":
      return {
        field: "ENTRY_ORIGIN",
        operator: draft.operator as "IS_ONE_OF" | "IS_NOT_ONE_OF",
        values: values.filter((value): value is (typeof RULE_ENTRY_ORIGINS)[number] =>
          (RULE_ENTRY_ORIGINS as readonly string[]).includes(value),
        ),
      };
    case "ACCOUNT":
      return { field: "ACCOUNT", operator: draft.operator as "IS_ONE_OF" | "IS_NOT_ONE_OF", values };
  }
}

export function actionDraftToAction(draft: RuleActionDraft): RuleAction {
  return draft.type === "ASSIGN_CATEGORY"
    ? { type: "ASSIGN_CATEGORY", categoryId: draft.categoryId }
    : { type: "ROUTE_FOR_REVIEW" };
}

export function ruleDraftToDefinition(draft: RuleDraft): RuleDefinition {
  return {
    trigger: "TRANSACTION_CREATED",
    conditions: [draft.trigger, ...draft.conditions].map(conditionDraftToCondition),
    action: actionDraftToAction(draft.action),
  };
}

export function validateRuleDraft(draft: RuleDraft): RuleDraftIssues {
  const conditions: Record<string, RuleDraftIssue> = {};
  for (const condition of draft.conditions) {
    const issue = conditionDraftIssue(condition);
    if (issue) conditions[condition.key] = issue;
  }
  const name = draft.name.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  return {
    trigger: conditionDraftIssue(draft.trigger),
    conditions,
    conditionsLimit: draft.conditions.length + 1 > MAX_RULE_CONDITIONS ? "TOO_MANY_CONDITIONS" : null,
    action: draft.action.type === "ASSIGN_CATEGORY" && !draft.action.categoryId ? "CATEGORY_REQUIRED" : null,
    name: !name ? "NAME_REQUIRED" : name.length > MAX_RULE_TEXT_LENGTH ? "NAME_TOO_LONG" : null,
    priority: parseRulePriority(draft.priority) === null ? "PRIORITY_INVALID" : null,
  };
}

export function isRuleStepValid(step: RuleBuilderStep, issues: RuleDraftIssues): boolean {
  switch (step) {
    case "TRIGGER":
      return issues.trigger === null;
    case "CONDITIONS":
      return issues.conditionsLimit === null && Object.keys(issues.conditions).length === 0;
    case "ACTION":
      return issues.action === null;
    case "REVIEW":
      return issues.name === null && issues.priority === null;
  }
}

export function firstInvalidRuleStep(issues: RuleDraftIssues): RuleBuilderStep | null {
  return RULE_BUILDER_STEPS.find((step) => !isRuleStepValid(step, issues)) ?? null;
}

export function isRuleDefinitionReady(draft: RuleDraft): boolean {
  const issues = validateRuleDraft(draft);
  if (!(["TRIGGER", "CONDITIONS", "ACTION"] as const).every((step) => isRuleStepValid(step, issues))) return false;
  return ruleDefinitionSchema.safeParse(ruleDraftToDefinition(draft)).success;
}

export function ruleDraftFingerprint(draft: RuleDraft): string {
  return JSON.stringify({
    definition: ruleDraftToDefinition(draft),
    priority: parseRulePriority(draft.priority),
  });
}

function canonicalDefinition(definition: Pick<RuleDefinition, "conditions" | "action">): string {
  return JSON.stringify({
    conditions: definition.conditions.map((condition) => JSON.stringify(condition)).sort(),
    action: definition.action,
  });
}

export function ruleCreatePayload(draft: RuleDraft, idempotencyKey: string): CreateRuleCommand {
  const definition = ruleDraftToDefinition(draft);
  return {
    name: draft.name,
    priority: parseRulePriority(draft.priority) ?? 0,
    trigger: definition.trigger,
    conditions: [...definition.conditions],
    action: definition.action,
    enabled: draft.enabled,
    idempotencyKey,
  };
}

export function ruleUpdatePayload(
  original: {
    readonly name: string;
    readonly priority: number;
    readonly updatedAt: string;
    readonly definition: Pick<RuleDefinition, "conditions" | "action">;
  },
  draft: RuleDraft,
  idempotencyKey: string,
): UpdateRuleCommand {
  const definition = ruleDraftToDefinition(draft);
  const priority = parseRulePriority(draft.priority);
  const name = draft.name.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  const definitionChanged = canonicalDefinition(definition) !== canonicalDefinition(original.definition);
  return {
    ...(name !== original.name ? { name } : {}),
    ...(priority !== null && priority !== original.priority ? { priority } : {}),
    ...(definitionChanged
      ? { trigger: definition.trigger, conditions: [...definition.conditions], action: definition.action }
      : {}),
    expectedUpdatedAt: original.updatedAt,
    idempotencyKey,
  };
}
