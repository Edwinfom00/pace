import type { LedgerTransactionKind } from "@/modules/ledger/domain";

export const RULE_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RULE_ORIGINS = ["USER", "AGENT"] as const;
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

export const RULE_TRIGGERS = ["TRANSACTION_CREATED"] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

export const RULE_TRANSACTION_KINDS = ["EXPENSE", "INCOME", "TRANSFER", "REFUND"] as const satisfies readonly LedgerTransactionKind[];
export type RuleTransactionKind = (typeof RULE_TRANSACTION_KINDS)[number];

export const RULE_ENTRY_ORIGINS = ["MANUAL", "IMPORT", "AGENT", "OTHER"] as const;
export type RuleEntryOrigin = (typeof RULE_ENTRY_ORIGINS)[number];

export const RULE_SET_OPERATORS = ["IS_ONE_OF", "IS_NOT_ONE_OF"] as const;
export type RuleSetOperator = (typeof RULE_SET_OPERATORS)[number];

export const RULE_TEXT_OPERATORS = ["EQUALS", "CONTAINS", "STARTS_WITH", "IS_EMPTY", "IS_NOT_EMPTY"] as const;
export type RuleTextOperator = (typeof RULE_TEXT_OPERATORS)[number];

export const RULE_OPTIONAL_SET_OPERATORS = [...RULE_SET_OPERATORS, "IS_EMPTY", "IS_NOT_EMPTY"] as const;
export type RuleOptionalSetOperator = (typeof RULE_OPTIONAL_SET_OPERATORS)[number];

export type RuleCondition =
  | { readonly field: "TRANSACTION_KIND"; readonly operator: RuleSetOperator; readonly values: readonly RuleTransactionKind[] }
  | { readonly field: "ENTRY_ORIGIN"; readonly operator: RuleSetOperator; readonly values: readonly RuleEntryOrigin[] }
  | { readonly field: "ACCOUNT"; readonly operator: RuleSetOperator; readonly values: readonly string[] }
  | { readonly field: "CATEGORY"; readonly operator: RuleOptionalSetOperator; readonly values: readonly string[] }
  | { readonly field: "COUNTERPARTY"; readonly operator: RuleTextOperator; readonly value: string | null }
  | { readonly field: "NOTE"; readonly operator: RuleTextOperator; readonly value: string | null };
export type RuleConditionField = RuleCondition["field"];

export const RULE_ACTION_TYPES = ["ASSIGN_CATEGORY", "ROUTE_FOR_REVIEW"] as const;
export type RuleActionType = (typeof RULE_ACTION_TYPES)[number];

export type RuleAction =
  | { readonly type: "ASSIGN_CATEGORY"; readonly categoryId: string }
  | { readonly type: "ROUTE_FOR_REVIEW" };

export interface RuleDefinition {
  readonly trigger: RuleTrigger;
  readonly conditions: readonly RuleCondition[];
  readonly action: RuleAction;
}

export interface RuleRecord extends RuleDefinition {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: RuleStatus;
  readonly enabled: boolean;
  readonly priority: number;
  readonly revision: number;
  readonly origin: RuleOrigin;
  readonly createdByUserId: string;
  readonly updatedByUserId: string;
  readonly createdByAgentActionId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const RULE_MANAGEMENT_ACTIONS = ["CREATE", "UPDATE", "ENABLE", "DISABLE", "ARCHIVE"] as const;
export type RuleManagementAction = (typeof RULE_MANAGEMENT_ACTIONS)[number];

export interface RuleManagementAuditRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly ruleId: string;
  readonly actorUserId: string;
  readonly action: RuleManagementAction;
  readonly commandFingerprint: string;
  readonly idempotencyKey: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export const RULE_EXECUTION_OUTCOMES = ["PENDING", "APPLIED", "SKIPPED", "SHADOWED", "FAILED"] as const;
export type RuleExecutionOutcome = (typeof RULE_EXECUTION_OUTCOMES)[number];

export const RULE_ACTION_SKIP_REASONS = [
  "TRANSACTION_KIND_NOT_SUPPORTED",
  "TRANSACTION_LOCKED",
  "CATEGORY_ALREADY_SET",
  "CATEGORY_UNAVAILABLE",
  "CATEGORY_KIND_MISMATCH",
  "ALREADY_IN_REVIEW",
  "SHADOWED_BY_HIGHER_PRIORITY_RULE",
  "ACTION_FAILED",
] as const;
export type RuleActionSkipReason = (typeof RULE_ACTION_SKIP_REASONS)[number];

export interface RuleExecutionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly transactionId: string;
  readonly trigger: RuleTrigger;
  readonly actionType: RuleActionType;
  readonly outcome: RuleExecutionOutcome;
  readonly reason: RuleActionSkipReason | null;
  readonly actorUserId: string;
  readonly explanation: Record<string, unknown>;
  readonly result: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RuleTransactionFacts {
  readonly transactionId: string;
  readonly kind: RuleTransactionKind;
  readonly entryOrigin: RuleEntryOrigin;
  readonly accountId: string | null;
  readonly categoryId: string | null;
  readonly counterparty: string | null;
  readonly note: string | null;
}

export interface RuleConditionExplanation {
  readonly index: number;
  readonly field: RuleConditionField;
  readonly operator: RuleCondition["operator"];
  readonly expected: readonly string[] | string | null;
  readonly actual: string | null;
  readonly matched: boolean;
}

export interface RuleMatchExplanation {
  readonly matched: boolean;
  readonly conditions: readonly RuleConditionExplanation[];
}

export interface RuleActionApplicability {
  readonly applicable: boolean;
  readonly reason: RuleActionSkipReason | null;
}

export type RulePlanDecision = "APPLY" | "SKIP" | "SHADOWED";

export interface RulePlanEntry {
  readonly rule: Pick<RuleRecord, "id" | "name" | "priority" | "revision" | "trigger" | "action" | "createdAt">;
  readonly match: RuleMatchExplanation;
  readonly decision: RulePlanDecision;
  readonly reason: RuleActionSkipReason | null;
}

export interface RuleEvaluationPlan {
  readonly transactionId: string;
  readonly trigger: RuleTrigger;
  readonly facts: RuleTransactionFacts;
  readonly evaluated: readonly RulePlanEntry[];
}
