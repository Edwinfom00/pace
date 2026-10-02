import type { LedgerCategoryRecord, LedgerTransactionRecord } from "@/modules/ledger/domain";

import type {
  RuleAction,
  RuleActionApplicability,
  RuleActionType,
  RuleCondition,
  RuleConditionExplanation,
  RuleEntryOrigin,
  RuleEvaluationPlan,
  RuleMatchExplanation,
  RulePlanEntry,
  RuleRecord,
  RuleTransactionFacts,
  RuleTransactionKind,
  RuleTrigger,
} from "./domain";
import { normalizeRuleText } from "./rule-contract";

export type RuleEvaluationCandidate = Pick<
  RuleRecord,
  "id" | "name" | "priority" | "revision" | "trigger" | "conditions" | "action" | "createdAt"
>;

export interface RuleActionContext {
  readonly categories: ReadonlyMap<string, Pick<LedgerCategoryRecord, "id" | "kind">>;
  readonly hasOpenReview: boolean;
  readonly detailsEditable: boolean;
}

export function toRuleTransactionFacts(
  transaction: Pick<
    LedgerTransactionRecord,
    "id" | "kind" | "source" | "accountId" | "categoryId" | "note"
  >,
  counterpartyName: string | null,
): RuleTransactionFacts | null {
  if (transaction.kind === "OPENING_BALANCE") return null;
  return {
    transactionId: transaction.id,
    kind: transaction.kind,
    entryOrigin: entryOriginFor(transaction.source),
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    counterparty: counterpartyName ? normalizeRuleText(counterpartyName) || null : null,
    note: transaction.note ? normalizeRuleText(transaction.note) || null : null,
  };
}

function entryOriginFor(source: Record<string, unknown>): RuleEntryOrigin {
  switch (source.provider) {
    case "manual":
      return "MANUAL";
    case "pace-import":
      return "IMPORT";
    case "pace-agent":
      return "AGENT";
    default:
      return "OTHER";
  }
}

export function compareRulePrecedence(
  left: Pick<RuleRecord, "id" | "priority" | "createdAt">,
  right: Pick<RuleRecord, "id" | "priority" | "createdAt">,
): number {
  if (left.priority !== right.priority) return left.priority - right.priority;
  const created = left.createdAt.getTime() - right.createdAt.getTime();
  if (created !== 0) return created;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function evaluateRuleConditions(
  conditions: readonly RuleCondition[],
  facts: RuleTransactionFacts,
): RuleMatchExplanation {
  const explained = conditions.map((condition, index) => explainCondition(condition, index, facts));
  return {
    matched: explained.length > 0 && explained.every((condition) => condition.matched),
    conditions: explained,
  };
}

function explainCondition(
  condition: RuleCondition,
  index: number,
  facts: RuleTransactionFacts,
): RuleConditionExplanation {
  const base = { index, field: condition.field, operator: condition.operator };
  switch (condition.field) {
    case "TRANSACTION_KIND":
      return { ...base, expected: condition.values, actual: facts.kind, matched: matchSet(condition.operator, condition.values, facts.kind) };
    case "ENTRY_ORIGIN":
      return { ...base, expected: condition.values, actual: facts.entryOrigin, matched: matchSet(condition.operator, condition.values, facts.entryOrigin) };
    case "ACCOUNT":
      return { ...base, expected: condition.values, actual: facts.accountId, matched: matchSet(condition.operator, condition.values, facts.accountId) };
    case "CATEGORY":
      return { ...base, expected: condition.values, actual: facts.categoryId, matched: matchOptionalSet(condition.operator, condition.values, facts.categoryId) };
    case "COUNTERPARTY":
      return { ...base, expected: condition.value, actual: facts.counterparty, matched: matchText(condition.operator, condition.value, facts.counterparty) };
    case "NOTE":
      return { ...base, expected: condition.value, actual: facts.note, matched: matchText(condition.operator, condition.value, facts.note) };
  }
}

function matchSet(operator: "IS_ONE_OF" | "IS_NOT_ONE_OF", values: readonly string[], actual: string | null): boolean {
  const included = actual !== null && values.includes(actual);
  return operator === "IS_ONE_OF" ? included : !included;
}

function matchOptionalSet(
  operator: "IS_ONE_OF" | "IS_NOT_ONE_OF" | "IS_EMPTY" | "IS_NOT_EMPTY",
  values: readonly string[],
  actual: string | null,
): boolean {
  if (operator === "IS_EMPTY") return actual === null;
  if (operator === "IS_NOT_EMPTY") return actual !== null;
  return matchSet(operator, values, actual);
}

function matchText(
  operator: "EQUALS" | "CONTAINS" | "STARTS_WITH" | "IS_EMPTY" | "IS_NOT_EMPTY",
  expected: string | null,
  actual: string | null,
): boolean {
  switch (operator) {
    case "IS_EMPTY":
      return actual === null;
    case "IS_NOT_EMPTY":
      return actual !== null;
    case "EQUALS":
      return actual !== null && expected !== null && actual === expected;
    case "CONTAINS":
      return actual !== null && expected !== null && actual.includes(expected);
    case "STARTS_WITH":
      return actual !== null && expected !== null && actual.startsWith(expected);
  }
}

const CATEGORIZABLE_KINDS: readonly RuleTransactionKind[] = ["EXPENSE", "INCOME"];

export function assessRuleAction(
  action: RuleAction,
  facts: RuleTransactionFacts,
  context: RuleActionContext,
): RuleActionApplicability {
  if (!CATEGORIZABLE_KINDS.includes(facts.kind))
    return { applicable: false, reason: "TRANSACTION_KIND_NOT_SUPPORTED" };
  switch (action.type) {
    case "ASSIGN_CATEGORY": {
      if (!context.detailsEditable) return { applicable: false, reason: "TRANSACTION_LOCKED" };
      if (facts.categoryId !== null) return { applicable: false, reason: "CATEGORY_ALREADY_SET" };
      const category = context.categories.get(action.categoryId);
      if (!category) return { applicable: false, reason: "CATEGORY_UNAVAILABLE" };
      if (category.kind !== facts.kind) return { applicable: false, reason: "CATEGORY_KIND_MISMATCH" };
      return { applicable: true, reason: null };
    }
    case "ROUTE_FOR_REVIEW":
      return context.hasOpenReview
        ? { applicable: false, reason: "ALREADY_IN_REVIEW" }
        : { applicable: true, reason: null };
  }
}

export function planRuleEvaluation(input: {
  readonly trigger: RuleTrigger;
  readonly facts: RuleTransactionFacts;
  readonly rules: readonly RuleEvaluationCandidate[];
  readonly context: RuleActionContext;
}): RuleEvaluationPlan {
  const ordered = input.rules
    .filter((rule) => rule.trigger === input.trigger)
    .sort(compareRulePrecedence);
  const claimed = new Set<RuleActionType>();
  const evaluated: RulePlanEntry[] = [];
  for (const rule of ordered) {
    const match = evaluateRuleConditions(rule.conditions, input.facts);
    if (!match.matched) continue;
    const summary = {
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      revision: rule.revision,
      trigger: rule.trigger,
      action: rule.action,
      createdAt: rule.createdAt,
    };
    if (claimed.has(rule.action.type)) {
      evaluated.push({ rule: summary, match, decision: "SHADOWED", reason: "SHADOWED_BY_HIGHER_PRIORITY_RULE" });
      continue;
    }
    const applicability = assessRuleAction(rule.action, input.facts, input.context);
    if (!applicability.applicable) {
      evaluated.push({ rule: summary, match, decision: "SKIP", reason: applicability.reason });
      continue;
    }
    claimed.add(rule.action.type);
    evaluated.push({ rule: summary, match, decision: "APPLY", reason: null });
  }
  return { transactionId: input.facts.transactionId, trigger: input.trigger, facts: input.facts, evaluated };
}
