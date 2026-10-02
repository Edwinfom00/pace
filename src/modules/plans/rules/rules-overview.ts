import type {
  RuleActionSkipReason,
  RuleActionType,
  RuleCondition,
  RuleConditionField,
  RuleExecutionOutcome,
  RuleExecutionRecord,
  RuleOrigin,
  RuleRecord,
} from "./domain";

export const RULE_STATUS_FILTERS = ["ALL", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type RuleStatusFilter = (typeof RULE_STATUS_FILTERS)[number];
export type RuleDisplayStatus = Exclude<RuleStatusFilter, "ALL">;

export const RECENT_RULE_EXECUTIONS_LIMIT = 5;

export type RuleConditionView = {
  readonly field: RuleConditionField;
  readonly operator: RuleCondition["operator"];
  readonly values: readonly (string | null)[];
};

export type RuleActionView =
  | {
      readonly type: "ASSIGN_CATEGORY";
      readonly categoryId: string;
      readonly categoryName: string | null;
      readonly categoryKey: string | null;
    }
  | { readonly type: "ROUTE_FOR_REVIEW" };

export type RuleListItem = {
  readonly id: string;
  readonly name: string;
  readonly status: RuleDisplayStatus;
  readonly priority: number;
  readonly origin: RuleOrigin;
  readonly trigger: RuleConditionView | null;
  readonly conditions: readonly RuleConditionView[];
  readonly action: RuleActionView;
  readonly appliedCount: number;
  readonly lastAppliedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdByActor: boolean;
  readonly capabilities: { readonly canToggle: boolean; readonly canArchive: boolean };
};

export type RuleExecutionView = {
  readonly id: string;
  readonly transactionId: string;
  readonly actionType: RuleActionType;
  readonly outcome: RuleExecutionOutcome;
  readonly reason: RuleActionSkipReason | null;
  readonly executedAt: string;
  readonly transaction: {
    readonly label: string | null;
    readonly kind: string;
    readonly amountMinor: string;
    readonly currency: string;
    readonly occurredAt: string;
  } | null;
};

export type RulesKpis = {
  readonly total: number;
  readonly active: number;
  readonly appliedThisMonth: number;
  readonly sentForReviewThisMonth: number;
};

export type RulesOverview = {
  readonly kpis: RulesKpis;
  readonly rules: readonly RuleListItem[];
  readonly visibleRuleIds: readonly string[];
  readonly selected: {
    readonly rule: RuleListItem;
    readonly executions: readonly RuleExecutionView[];
    readonly explicit: boolean;
  } | null;
  readonly filters: { readonly query: string; readonly status: RuleStatusFilter };
  readonly canManage: boolean;
};

export type RuleReferenceNames = {
  readonly categories: ReadonlyMap<string, { readonly name: string; readonly key: string | null }>;
  readonly accounts: ReadonlyMap<string, string>;
};

export function parseRuleStatusFilter(value: string | undefined): RuleStatusFilter {
  const candidate = value?.toUpperCase();
  return RULE_STATUS_FILTERS.includes(candidate as RuleStatusFilter) ? (candidate as RuleStatusFilter) : "ALL";
}

export function ruleDisplayStatus(rule: Pick<RuleRecord, "status" | "enabled">): RuleDisplayStatus {
  if (rule.status === "ARCHIVED") return "ARCHIVED";
  return rule.enabled ? "ACTIVE" : "PAUSED";
}

function conditionView(condition: RuleCondition, names: RuleReferenceNames): RuleConditionView {
  switch (condition.field) {
    case "COUNTERPARTY":
    case "NOTE":
      return { field: condition.field, operator: condition.operator, values: condition.value ? [condition.value] : [] };
    case "ACCOUNT":
      return {
        field: condition.field,
        operator: condition.operator,
        values: condition.values.map((id) => names.accounts.get(id) ?? null),
      };
    case "CATEGORY":
      return {
        field: condition.field,
        operator: condition.operator,
        values: condition.values.map((id) => names.categories.get(id)?.name ?? null),
      };
    default:
      return { field: condition.field, operator: condition.operator, values: [...condition.values] };
  }
}

const TRIGGER_FIELD_PRECEDENCE: readonly RuleConditionField[] = ["COUNTERPARTY", "NOTE"];

function splitTrigger(conditions: readonly RuleCondition[]): {
  readonly trigger: RuleCondition | null;
  readonly rest: readonly RuleCondition[];
} {
  const index = TRIGGER_FIELD_PRECEDENCE.map((field) => conditions.findIndex((item) => item.field === field)).find(
    (position) => position >= 0,
  );
  const position = index ?? (conditions.length ? 0 : -1);
  if (position < 0) return { trigger: null, rest: [] };
  return { trigger: conditions[position]!, rest: conditions.filter((_, current) => current !== position) };
}

function actionView(rule: RuleRecord, names: RuleReferenceNames): RuleActionView {
  if (rule.action.type === "ROUTE_FOR_REVIEW") return { type: "ROUTE_FOR_REVIEW" };
  const category = names.categories.get(rule.action.categoryId);
  return {
    type: "ASSIGN_CATEGORY",
    categoryId: rule.action.categoryId,
    categoryName: category?.name ?? null,
    categoryKey: category?.key ?? null,
  };
}

export function toRuleListItem(
  rule: RuleRecord,
  executions: readonly RuleExecutionRecord[],
  context: { readonly names: RuleReferenceNames; readonly actorUserId: string; readonly canManage: boolean },
): RuleListItem {
  const applied = executions.filter((execution) => execution.ruleId === rule.id && execution.outcome === "APPLIED");
  const lastApplied = applied.reduce<Date | null>(
    (latest, execution) => (!latest || execution.updatedAt > latest ? execution.updatedAt : latest),
    null,
  );
  const status = ruleDisplayStatus(rule);
  const { trigger, rest } = splitTrigger(rule.conditions);
  const mutable = context.canManage && status !== "ARCHIVED";
  return {
    id: rule.id,
    name: rule.name,
    status,
    priority: rule.priority,
    origin: rule.origin,
    trigger: trigger ? conditionView(trigger, context.names) : null,
    conditions: rest.map((condition) => conditionView(condition, context.names)),
    action: actionView(rule, context.names),
    appliedCount: applied.length,
    lastAppliedAt: lastApplied?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    createdByActor: rule.createdByUserId === context.actorUserId,
    capabilities: { canToggle: mutable, canArchive: mutable },
  };
}

export function computeRulesKpis(
  rules: readonly RuleRecord[],
  executions: readonly RuleExecutionRecord[],
  month: { readonly start: Date; readonly end: Date },
): RulesKpis {
  const current = rules.filter((rule) => rule.status === "ACTIVE");
  const known = new Set(rules.map((rule) => rule.id));
  const appliedThisMonth = executions.filter(
    (execution) =>
      known.has(execution.ruleId) &&
      execution.outcome === "APPLIED" &&
      execution.updatedAt >= month.start &&
      execution.updatedAt < month.end,
  );
  return {
    total: current.length,
    active: current.filter((rule) => rule.enabled).length,
    appliedThisMonth: appliedThisMonth.length,
    sentForReviewThisMonth: appliedThisMonth.filter((execution) => execution.actionType === "ROUTE_FOR_REVIEW").length,
  };
}

export function normalizeRuleSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

function searchableText(rule: RuleListItem): string {
  const conditions = [rule.trigger, ...rule.conditions].flatMap((condition) =>
    condition ? condition.values.filter((value): value is string => value !== null) : [],
  );
  const category = rule.action.type === "ASSIGN_CATEGORY" ? (rule.action.categoryName ?? "") : "";
  return normalizeRuleSearch([rule.name, category, ...conditions].join(" "));
}

export function filterRuleItems(
  rules: readonly RuleListItem[],
  filters: { readonly query: string; readonly status: RuleStatusFilter },
): RuleListItem[] {
  const terms = normalizeRuleSearch(filters.query).split(" ").filter(Boolean);
  return rules.filter((rule) => {
    if (filters.status === "ALL" ? rule.status === "ARCHIVED" : rule.status !== filters.status) return false;
    if (!terms.length) return true;
    const haystack = searchableText(rule);
    return terms.every((term) => haystack.includes(term));
  });
}

export function selectRule(
  rules: readonly RuleListItem[],
  visible: readonly RuleListItem[],
  requestedId: string | undefined,
): { readonly rule: RuleListItem; readonly explicit: boolean } | null {
  const requested = requestedId ? rules.find((rule) => rule.id === requestedId) : undefined;
  if (requested) return { rule: requested, explicit: true };
  const fallback = visible[0];
  return fallback ? { rule: fallback, explicit: false } : null;
}
