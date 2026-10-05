import { ConflictError, NotFoundError } from "@/authorization/errors";
import { resolveAccountReference } from "@/modules/accounts/domain/account-reference";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
} from "@/modules/ledger/domain";
import {
  resolveBudgetReference,
  resolveGoalReference,
  resolvePlanName,
  resolveRuleReference,
  type AgentBudgetView,
  type AgentContributionView,
  type AgentGoalView,
  type BudgetReference,
  type GoalReference,
  type PlanReferenceResolution,
  type RuleReference,
} from "@/modules/plans/agent-plans-view";
import type {
  BudgetRecord,
  BudgetSummary,
  SavingsGoalContribution,
  SavingsGoalSummary,
} from "@/modules/plans/domain";
import type {
  RuleAction,
  RuleActionType,
  RuleCondition,
  RuleConditionField,
  RuleDefinition,
  RuleRecord,
} from "@/modules/plans/rules/domain";
import {
  MAX_RULE_PRIORITY,
  MAX_RULE_TEXT_LENGTH,
  MIN_RULE_PRIORITY,
  ruleDefinitionSchema,
} from "@/modules/plans/rules/rule-contract";
import { suggestRulePriority } from "@/modules/plans/rules/rule-draft";
import type { RuleDraftDryRunResult } from "@/modules/plans/rules/rule-service";
import { isCurrencyCode } from "@/money/currency";
import {
  localDateForInstant,
  zonedLocalDateTimeToInstant,
} from "@/money/period";

import {
  PLANNING_DRAFT_FIELDS,
  type BudgetPlanningDraft,
  type BudgetPlanningValues,
  type ContributionPlanningDraft,
  type GoalPlanningDraft,
  type GoalPlanningValues,
  type PlanningActionResult,
  type PlanningActionType,
  type PlanningApprovalSummary,
  type PlanningDraft,
  type PlanningDraftField,
  type PlanningDraftOption,
  type RulePlanningDraft,
  type RulePlanningDryRun,
  type RulePlanningValues,
} from "./domain";
import { formatAmount } from "./recurring-draft";
import { cleanOptionalText, parseAmountToMinor } from "./transaction-draft";

export interface BudgetPlanningIntent extends BudgetReference {
  family: "BUDGET";
  operation: "CREATE" | "EDIT" | "ARCHIVE";
  subcategoryNames?: readonly string[] | null;
  wholeCategory?: boolean | null;
  amountText?: string | null;
  currency?: string | null;
  sourceText?: string | null;
}

export interface GoalPlanningIntent extends GoalReference {
  family: "GOAL";
  operation: "CREATE" | "EDIT" | "ARCHIVE" | "COMPLETE";
  name?: string | null;
  targetAmountText?: string | null;
  /** Calendar date, YYYY-MM-DD. */
  targetDate?: string | null;
  clearTargetDate?: boolean | null;
  savedAmountText?: string | null;
  currency?: string | null;
  sourceText?: string | null;
}

export interface ContributionPlanningIntent extends GoalReference {
  family: "CONTRIBUTION";
  operation: "ADD" | "CORRECT" | "REVERSE";
  contributionId?: string | null;
  contributionAmountText?: string | null;
  latestContribution?: boolean | null;
  amountText?: string | null;
  currency?: string | null;
  /** Calendar date, YYYY-MM-DD. */
  effectiveOn?: string | null;
  note?: string | null;
  sourceText?: string | null;
}

export interface RuleConditionIntent {
  field: RuleConditionField;
  operator: RuleCondition["operator"];
  text?: string | null;
  values?: readonly string[] | null;
}

export interface RulePlanningIntent extends RuleReference {
  family: "RULE";
  operation: "CREATE" | "EDIT" | "ENABLE" | "DISABLE" | "ARCHIVE";
  name?: string | null;
  priority?: number | null;
  conditions?: readonly RuleConditionIntent[] | null;
  action?: { type: RuleActionType; categoryName?: string | null } | null;
  sourceText?: string | null;
}

export type PlanningDraftIntent =
  | BudgetPlanningIntent
  | GoalPlanningIntent
  | ContributionPlanningIntent
  | RulePlanningIntent;

export interface BudgetPlanningContext {
  currency: string;
  timezone: string;
  now: Date;
  categories: readonly LedgerCategoryRecord[];
  budgets: readonly AgentBudgetView[];
}

export interface GoalPlanningContext {
  currency: string;
  timezone: string;
  now: Date;
  goals: readonly AgentGoalView[];
}

export interface ContributionPlanningContext {
  timezone: string;
  now: Date;
  goals: readonly AgentGoalView[];
  /** History of the resolved goal; empty while the goal is still unresolved. */
  contributions: readonly AgentContributionView[];
}

export interface RulePlanningContext {
  rules: readonly RuleRecord[];
  categories: readonly LedgerCategoryRecord[];
  accounts: readonly LedgerAccountRecord[];
}

const NO_LEDGER_EFFECT =
  "It does not create, edit, or delete any Transaction, and no account balance changes.";
const CONTRIBUTION_EFFECTS = [
  "This records goal progress only.",
  "No money will be moved from an account.",
] as const;
const RULE_SAFETY: Readonly<Record<RuleActionType, string>> = {
  ASSIGN_CATEGORY:
    "When it runs, it can only set the category of a matching transaction that has none. It never moves money or changes an amount, account, or balance.",
  ROUTE_FOR_REVIEW:
    "When it runs, it can only send a matching transaction to the Inbox for review. It never moves money or changes an amount, account, category, or balance.",
};
const CONDITION_FIELDS: Readonly<Record<RuleConditionField, string>> = {
  COUNTERPARTY: "Merchant",
  NOTE: "Note",
  ACCOUNT: "Account",
  CATEGORY: "Category",
  TRANSACTION_KIND: "Type",
  ENTRY_ORIGIN: "Source",
};
const CONDITION_OPERATORS: Readonly<Record<RuleCondition["operator"], string>> =
  {
    EQUALS: "is",
    CONTAINS: "contains",
    STARTS_WITH: "starts with",
    IS_EMPTY: "is empty",
    IS_NOT_EMPTY: "is not empty",
    IS_ONE_OF: "is one of",
    IS_NOT_ONE_OF: "is not one of",
  };
const DRY_RUN_SAMPLES = 5;

export function planningActionType(draft: PlanningDraft): PlanningActionType {
  switch (draft.planningOperation) {
    case "BUDGET_CREATE":
      return "BUDGET_CREATE";
    case "BUDGET_EDIT":
    case "BUDGET_ARCHIVE":
      return "BUDGET_UPDATE";
    case "GOAL_CREATE":
      return "SAVINGS_GOAL_CREATE";
    case "GOAL_EDIT":
    case "GOAL_ARCHIVE":
    case "GOAL_COMPLETE":
      return "SAVINGS_GOAL_UPDATE";
    case "CONTRIBUTION_ADD":
    case "CONTRIBUTION_CORRECT":
    case "CONTRIBUTION_REVERSE":
      return "SAVINGS_GOAL_CONTRIBUTION";
    case "RULE_CREATE":
      return "RULE_CREATE";
    default:
      return "RULE_MANAGE";
  }
}

export function planningIdempotencyKey(actionId: string): string {
  return `agent-action:${actionId}`;
}

export function isBudgetPlanningDraft(
  draft: PlanningDraft,
): draft is BudgetPlanningDraft {
  return draft.planningOperation.startsWith("BUDGET_");
}

export function isGoalPlanningDraft(
  draft: PlanningDraft,
): draft is GoalPlanningDraft {
  return draft.planningOperation.startsWith("GOAL_");
}

export function isContributionPlanningDraft(
  draft: PlanningDraft,
): draft is ContributionPlanningDraft {
  return draft.planningOperation.startsWith("CONTRIBUTION_");
}

export function isRulePlanningDraft(
  draft: PlanningDraft,
): draft is RulePlanningDraft {
  return draft.planningOperation.startsWith("RULE_");
}

/**
 * Turns a requested budget change into a JSON-safe draft. The budget, its
 * category, and its subcategories are resolved here from the workspace's own
 * records, never from an id or a guess by the model; anything unresolved is
 * reported as a missing field. The approval summary is added by
 * completeBudgetPlanningDraft once the server has previewed the spend.
 */
export function buildBudgetPlanningDraft(
  intent: BudgetPlanningIntent,
  context: BudgetPlanningContext,
): BudgetPlanningDraft {
  assertSameCurrency(intent.currency, context.currency, "Budgets");
  const missing: PlanningDraftField[] = [];
  const options: BudgetPlanningDraft["options"] = {};
  const base = {
    currency: context.currency,
    approvalSummary: null,
    sourceText: cleanOptionalText(intent.sourceText),
  };
  const amountMinor = requestedAmount(
    intent.amountText,
    context.currency,
    "Budgets",
    "amount",
    missing,
  );

  if (intent.operation === "CREATE") {
    const values: {
      -readonly [TKey in keyof BudgetPlanningValues]: BudgetPlanningValues[TKey];
    } = {};
    let label: string | null = null;
    if (intent.overall) {
      if (intent.subcategoryNames?.length)
        throw new ConflictError(
          "An overall budget cannot select subcategories.",
        );
      values.scope = "OVERALL";
      values.categoryId = null;
      values.subcategoryIds = [];
      label = "Overall";
    } else {
      const expenses = context.categories.filter(
        (category) => category.kind === "EXPENSE",
      );
      const category = resolvePlanName(
        intent.categoryName,
        expenses,
        (candidate) => candidate.name,
      );
      if (category.status === "RESOLVED") {
        values.scope = "CATEGORY";
        values.categoryId = category.item.id;
        values.subcategoryIds =
          requestedSubcategories(
            intent,
            category.item.id,
            context.categories,
            missing,
            options,
          ) ?? [];
        label = category.item.name;
      } else {
        missing.push("category");
        options.category = category.candidates.map((candidate) =>
          categoryOption(candidate, context.categories),
        );
      }
    }
    if (amountMinor) values.amountMinor = amountMinor;
    else if (!missing.includes("amount")) missing.push("amount");

    const month =
      cleanOptionalText(intent.month) ??
      currentMonth(context.now, context.timezone);
    const period = monthPeriod(month, context.timezone);
    if (period) {
      values.startsOn = period.startsOn;
      values.endsOn = period.endsOn;
    } else missing.push("period");

    return {
      ...base,
      planningOperation: "BUDGET_CREATE",
      targetId: null,
      expectedUpdatedAt: null,
      label,
      candidates: [],
      options,
      values,
      missingFields: ordered(missing),
    };
  }

  const planningOperation =
    intent.operation === "EDIT" ? "BUDGET_EDIT" : "BUDGET_ARCHIVE";
  const target = requireKnownId(
    intent.budgetId,
    resolveBudgetReference(intent, context.budgets),
    "Budget not found in this workspace.",
  );
  if (target.status !== "RESOLVED") {
    return {
      ...base,
      planningOperation,
      targetId: null,
      expectedUpdatedAt: null,
      label: null,
      candidates: target.candidates.map(budgetOption),
      options,
      values: {},
      missingFields: ["budget"],
    };
  }

  const budget = target.item;
  const values: {
    -readonly [TKey in keyof BudgetPlanningValues]: BudgetPlanningValues[TKey];
  } = {};
  if (planningOperation === "BUDGET_ARCHIVE") {
    if (!budget.allowedActions.canArchive)
      throw new ConflictError("This budget is already archived.");
  } else {
    if (!budget.allowedActions.canEdit)
      throw new ConflictError("Archived budgets cannot be edited.");
    if (amountMinor) values.amountMinor = amountMinor;
    if (intent.wholeCategory || intent.subcategoryNames?.length) {
      if (!budget.category)
        throw new ConflictError(
          "An overall budget cannot select subcategories.",
        );
      const subcategoryIds = requestedSubcategories(
        intent,
        budget.category.id,
        context.categories,
        missing,
        options,
      );
      if (subcategoryIds) values.subcategoryIds = subcategoryIds;
    }
    if (missing.length === 0) {
      if (Object.keys(values).length === 0) missing.push("change");
      else if (
        (values.amountMinor === undefined ||
          values.amountMinor === budget.amount.minorUnits) &&
        (values.subcategoryIds === undefined ||
          sameIds(
            values.subcategoryIds,
            budget.subcategories.map((subcategory) => subcategory.id),
          ))
      ) {
        throw new ConflictError("This budget already has these values.");
      }
    }
  }

  return {
    ...base,
    planningOperation,
    targetId: budget.id,
    expectedUpdatedAt: budget.updatedAt,
    label: budget.label,
    candidates: [],
    options,
    values,
    missingFields: ordered(missing),
  };
}

export function completeBudgetPlanningDraft(
  draft: BudgetPlanningDraft,
  context: BudgetPlanningContext,
  preview: BudgetSummary | null,
): BudgetPlanningDraft {
  if (draft.missingFields.length > 0) return draft;
  const { values, currency } = draft;
  const names = new Map(
    context.categories.map((category) => [category.id, category.name]),
  );
  const scopeLines = (
    scope: "OVERALL" | "CATEGORY",
    subcategoryIds: readonly string[],
  ) =>
    scope === "OVERALL"
      ? ["All spending, whatever its category"]
      : subcategoryIds.length > 0
        ? subcategoryIds.map((id) => names.get(id) ?? "Unknown category")
        : ["Whole category, including every subcategory"];

  if (draft.planningOperation === "BUDGET_CREATE") {
    const { scope, amountMinor, startsOn } = values;
    if (!scope || !amountMinor || !startsOn || !draft.label) return draft;
    return {
      ...draft,
      approvalSummary: approvalSummary(
        "Create budget",
        [
          {
            label: null,
            lines: [
              draft.label,
              monthLabel(localMonth(new Date(startsOn), context.timezone)),
              formatAmount(amountMinor, currency),
            ],
          },
          {
            label: "Scope",
            lines: scopeLines(scope, values.subcategoryIds ?? []),
          },
          ...(preview?.activeForPeriod
            ? [
                {
                  label: "Current matching spend",
                  lines: [
                    formatAmount(
                      preview.currentSpendMinor.toString(),
                      currency,
                    ),
                  ],
                },
              ]
            : []),
        ],
        ["This sets a spending plan only.", NO_LEDGER_EFFECT],
      ),
    };
  }

  const budget = context.budgets.find(
    (candidate) => candidate.id === draft.targetId,
  );
  if (!budget) return draft;
  const header = {
    label: null,
    lines: [budget.label, budgetPeriodLabel(budget)],
  };
  if (draft.planningOperation === "BUDGET_ARCHIVE") {
    return {
      ...draft,
      approvalSummary: approvalSummary(
        "Archive budget",
        [
          {
            ...header,
            lines: [
              ...header.lines,
              formatAmount(budget.amount.minorUnits, currency),
            ],
          },
        ],
        [
          "The budget stops being tracked. It is kept, not deleted.",
          NO_LEDGER_EFFECT,
        ],
      ),
    };
  }

  const changes: string[] = [];
  if (values.amountMinor !== undefined) {
    changes.push(
      `Amount: ${formatAmount(budget.amount.minorUnits, currency)} → ${formatAmount(values.amountMinor, currency)}`,
    );
  }
  if (values.subcategoryIds !== undefined) {
    const before = scopeLines(
      "CATEGORY",
      budget.subcategories.map((subcategory) => subcategory.id),
    ).join(", ");
    changes.push(
      `Scope: ${before} → ${scopeLines("CATEGORY", values.subcategoryIds).join(", ")}`,
    );
  }
  return {
    ...draft,
    approvalSummary: approvalSummary(
      "Edit budget",
      [header, { label: "Changes", lines: changes }],
      ["This changes the budget plan only.", NO_LEDGER_EFFECT],
    ),
  };
}

export function buildGoalPlanningDraft(
  intent: GoalPlanningIntent,
  context: GoalPlanningContext,
): GoalPlanningDraft {
  assertSameCurrency(intent.currency, context.currency, "Savings goals");
  const missing: PlanningDraftField[] = [];
  const { currency } = context;
  const base = {
    currency,
    options: {},
    sourceText: cleanOptionalText(intent.sourceText),
  };
  const name = cleanOptionalText(intent.name);
  if (name && name.length > 160)
    throw new ConflictError("Savings-goal name is too long.");
  const targetAmountMinor = requestedAmount(
    intent.targetAmountText,
    currency,
    "Savings goals",
    "targetAmount",
    missing,
  );
  const targetDate = requestedDate(
    intent.targetDate,
    context.timezone,
    { hour: 0, minute: 0 },
    "targetDate",
    missing,
  );

  if (intent.operation === "CREATE") {
    const openingSavedMinor = requestedAmount(
      intent.savedAmountText,
      currency,
      "Savings goals",
      "savedAmount",
      missing,
    );
    if (!name) missing.push("name");
    if (!targetAmountMinor && !missing.includes("targetAmount"))
      missing.push("targetAmount");
    const values: GoalPlanningValues = {
      ...(name ? { name } : {}),
      ...(targetAmountMinor ? { targetAmountMinor } : {}),
      targetDate: targetDate ?? null,
      ...(openingSavedMinor ? { openingSavedMinor } : {}),
    };
    const complete = missing.length === 0 && name && targetAmountMinor;
    return {
      ...base,
      planningOperation: "GOAL_CREATE",
      targetId: null,
      expectedUpdatedAt: null,
      label: name,
      candidates: [],
      values,
      approvalSummary: complete
        ? approvalSummary(
            "Create savings goal",
            [
              { label: null, lines: [name] },
              {
                label: "Target",
                lines: [formatAmount(targetAmountMinor, currency)],
              },
              ...(targetDate
                ? [
                    {
                      label: "Target date",
                      lines: [dayOf(targetDate, context.timezone)],
                    },
                  ]
                : []),
              ...(openingSavedMinor
                ? [
                    {
                      label: "Already saved",
                      lines: [formatAmount(openingSavedMinor, currency)],
                    },
                  ]
                : []),
            ],
            [
              openingSavedMinor
                ? "This creates a goal and records the already-saved amount as goal progress only."
                : "This creates a goal for tracking progress only.",
              "No money will be moved from an account.",
            ],
          )
        : null,
      missingFields: ordered(missing),
    };
  }

  const planningOperation = `GOAL_${intent.operation}` as const;
  const target = requireKnownId(
    intent.goalId,
    resolveGoalReference(intent, context.goals),
    "Savings goal not found in this workspace.",
  );
  if (target.status !== "RESOLVED") {
    return {
      ...base,
      planningOperation,
      targetId: null,
      expectedUpdatedAt: null,
      label: null,
      candidates: target.candidates.map(goalOption),
      values: {},
      approvalSummary: null,
      missingFields: ["goal"],
    };
  }

  const goal = target.item;
  const progress = `${formatAmount(goal.saved.minorUnits, currency)} of ${formatAmount(goal.target.minorUnits, currency)} saved`;
  let values: GoalPlanningValues = {};
  let summary: PlanningApprovalSummary | null = null;

  if (planningOperation === "GOAL_ARCHIVE") {
    if (!goal.allowedActions.canArchive)
      throw new ConflictError("This savings goal is already archived.");
    summary = approvalSummary(
      "Archive savings goal",
      [{ label: null, lines: [goal.name, progress] }],
      [
        "The goal is kept, not deleted, and its contribution history is preserved.",
        "No money will be moved from an account.",
      ],
    );
  } else if (planningOperation === "GOAL_COMPLETE") {
    if (!goal.allowedActions.canComplete) {
      throw new ConflictError(
        goal.status === "COMPLETED"
          ? "This savings goal is already completed."
          : goal.status === "ARCHIVED"
            ? "Archived savings goals cannot be changed."
            : "A savings goal can be completed only after its target is saved.",
      );
    }
    summary = approvalSummary(
      "Complete savings goal",
      [{ label: null, lines: [goal.name, progress] }],
      [
        "This marks the goal as completed. Its contribution history is preserved.",
        "No money will be moved from an account.",
      ],
    );
  } else {
    if (!goal.allowedActions.canEdit)
      throw new ConflictError("Archived savings goals cannot be changed.");
    const changes: string[] = [];
    if (name && name !== goal.name)
      changes.push(`Name: ${goal.name} → ${name}`);
    if (targetAmountMinor && targetAmountMinor !== goal.target.minorUnits) {
      changes.push(
        `Target: ${formatAmount(goal.target.minorUnits, currency)} → ${formatAmount(targetAmountMinor, currency)}`,
      );
    }
    const nextTargetDay = intent.clearTargetDate
      ? null
      : targetDate
        ? dayOf(targetDate, context.timezone)
        : undefined;
    if (nextTargetDay !== undefined && nextTargetDay !== goal.targetDate) {
      changes.push(
        `Target date: ${goal.targetDate ?? "none"} → ${nextTargetDay ?? "none"}`,
      );
    }
    values = {
      ...(name ? { name } : {}),
      ...(targetAmountMinor ? { targetAmountMinor } : {}),
      ...(intent.clearTargetDate
        ? { targetDate: null }
        : targetDate
          ? { targetDate }
          : {}),
    };
    if (missing.length === 0) {
      if (Object.keys(values).length === 0) missing.push("change");
      else if (changes.length === 0)
        throw new ConflictError("This savings goal already has these values.");
      else {
        summary = approvalSummary(
          "Edit savings goal",
          [
            { label: null, lines: [goal.name, progress] },
            { label: "Changes", lines: changes },
          ],
          [
            "This changes the goal's plan only. Recorded contributions are kept as they are.",
            "No money will be moved from an account.",
          ],
        );
      }
    }
  }

  return {
    ...base,
    planningOperation,
    targetId: goal.id,
    expectedUpdatedAt: goal.updatedAt,
    label: goal.name,
    candidates: [],
    values,
    approvalSummary: missing.length === 0 ? summary : null,
    missingFields: ordered(missing),
  };
}

/**
 * A contribution is an append-only planning event. The draft records the
 * progress before and after so the member approves the exact effect, and
 * nothing here ever names an account or a Transaction.
 */
export function buildContributionPlanningDraft(
  intent: ContributionPlanningIntent,
  context: ContributionPlanningContext,
): ContributionPlanningDraft {
  const planningOperation = `CONTRIBUTION_${intent.operation}` as const;
  const base = {
    planningOperation,
    options: {},
    sourceText: cleanOptionalText(intent.sourceText),
    note: cleanOptionalText(intent.note)?.slice(0, 500) ?? null,
  };
  const target = requireKnownId(
    intent.goalId,
    resolveGoalReference(intent, context.goals),
    "Savings goal not found in this workspace.",
  );
  if (target.status !== "RESOLVED") {
    return {
      ...base,
      targetId: null,
      expectedUpdatedAt: null,
      label: null,
      currency: null,
      candidates: target.candidates.map(goalOption),
      contributionId: null,
      originalAmountMinor: null,
      amountMinor: null,
      effectiveAt: null,
      savedBeforeMinor: null,
      savedAfterMinor: null,
      approvalSummary: null,
      missingFields: ["goal"],
    };
  }

  const goal = target.item;
  const { currency } = goal.saved;
  if (!goal.allowedActions.canContribute)
    throw new ConflictError("Archived savings goals cannot be changed.");
  assertSameCurrency(intent.currency, currency, "This savings goal");
  const missing: PlanningDraftField[] = [];
  const options: ContributionPlanningDraft["options"] = {};
  const saved = BigInt(goal.saved.minorUnits);
  const amountMinor =
    planningOperation === "CONTRIBUTION_REVERSE"
      ? null
      : requestedAmount(
          intent.amountText,
          currency,
          "This savings goal",
          "amount",
          missing,
        );
  if (
    planningOperation !== "CONTRIBUTION_REVERSE" &&
    !amountMinor &&
    !missing.includes("amount")
  )
    missing.push("amount");

  let original: AgentContributionView | null = null;
  let effectiveAt = context.now.toISOString();
  if (planningOperation === "CONTRIBUTION_ADD") {
    const requested = requestedDate(
      intent.effectiveOn,
      context.timezone,
      { hour: 12, minute: 0 },
      "effectiveDate",
      missing,
    );
    if (requested) effectiveAt = requested;
  } else {
    const located = locateContribution(intent, currency, context.contributions);
    if (located.status === "RESOLVED") original = located.item;
    else {
      missing.push("contribution");
      options.contribution = located.candidates.map((entry) =>
        contributionOption(entry, context.timezone),
      );
    }
    if (original && planningOperation === "CONTRIBUTION_CORRECT")
      effectiveAt = original.effectiveAt;
  }

  const originalMinor = original ? BigInt(original.amount.minorUnits) : null;
  if (
    originalMinor !== null &&
    amountMinor &&
    BigInt(amountMinor) === originalMinor
  ) {
    throw new ConflictError("This contribution already has that amount.");
  }
  const delta =
    planningOperation === "CONTRIBUTION_ADD"
      ? amountMinor
        ? BigInt(amountMinor)
        : null
      : originalMinor === null
        ? null
        : planningOperation === "CONTRIBUTION_REVERSE"
          ? -originalMinor
          : amountMinor
            ? BigInt(amountMinor) - originalMinor
            : null;
  const savedAfter = delta === null ? null : saved + delta;
  const complete = missing.length === 0 && savedAfter !== null;
  const progress = {
    label: "Progress",
    lines: [
      `${formatNumber(goal.saved.minorUnits, currency)} → ${formatAmount((savedAfter ?? saved).toString(), currency)}`,
    ],
  };
  const goalSection = { label: "Goal", lines: [goal.name] };
  const originalLine = original
    ? `${formatAmount(original.amount.minorUnits, currency)} on ${original.effectiveOn}`
    : "";

  const summary = !complete
    ? null
    : planningOperation === "CONTRIBUTION_ADD"
      ? approvalSummary(
          "Add contribution",
          [
            goalSection,
            { label: "Amount", lines: [formatAmount(amountMinor!, currency)] },
            progress,
          ],
          CONTRIBUTION_EFFECTS,
        )
      : planningOperation === "CONTRIBUTION_CORRECT"
        ? approvalSummary(
            "Correct contribution",
            [
              goalSection,
              { label: "Contribution", lines: [originalLine] },
              {
                label: "Corrected amount",
                lines: [formatAmount(amountMinor!, currency)],
              },
              progress,
            ],
            [
              "The original contribution stays in the history. It is reversed and a new contribution records the corrected amount.",
              ...CONTRIBUTION_EFFECTS,
            ],
          )
        : approvalSummary(
            "Reverse contribution",
            [
              goalSection,
              { label: "Contribution", lines: [originalLine] },
              progress,
            ],
            [
              "The contribution stays in the history. A reversal entry cancels it; nothing is deleted.",
              ...CONTRIBUTION_EFFECTS,
            ],
          );

  return {
    ...base,
    targetId: goal.id,
    expectedUpdatedAt: goal.updatedAt,
    label: goal.name,
    currency,
    candidates: [],
    options,
    contributionId: original?.id ?? null,
    originalAmountMinor: original?.amount.minorUnits ?? null,
    amountMinor,
    effectiveAt,
    savedBeforeMinor: goal.saved.minorUnits,
    savedAfterMinor: savedAfter?.toString() ?? null,
    approvalSummary: summary,
    missingFields: ordered(missing),
  };
}

/**
 * Builds a rule draft from typed conditions and one of the two canonical safe
 * actions. Names become ids here, and the resulting definition must pass the
 * canonical rule contract, so nothing the Rules service would not accept is
 * ever stored or shown for approval. completeRulePlanningDraft adds the
 * approval summary once the canonical dry run has been read.
 */
export function buildRulePlanningDraft(
  intent: RulePlanningIntent,
  context: RulePlanningContext,
): RulePlanningDraft {
  const missing: PlanningDraftField[] = [];
  const options: RulePlanningDraft["options"] = {};
  const base = {
    approvalSummary: null,
    dryRun: null,
    sourceText: cleanOptionalText(intent.sourceText),
  };
  const planningOperation = `RULE_${intent.operation}` as const;

  const name = cleanOptionalText(intent.name);
  if (name && name.length > MAX_RULE_TEXT_LENGTH)
    throw new ConflictError("The rule name is too long.");
  const conditions = intent.conditions?.length
    ? requestedConditions(intent.conditions, context, missing, options)
    : null;
  const action = intent.action
    ? requestedAction(intent.action, context, missing, options)
    : null;
  const priority = intent.priority ?? null;
  if (
    priority !== null &&
    (!Number.isInteger(priority) ||
      priority < MIN_RULE_PRIORITY ||
      priority > MAX_RULE_PRIORITY)
  ) {
    missing.push("priority");
  }

  if (planningOperation === "RULE_CREATE") {
    if (!name) missing.push("name");
    if (!intent.conditions?.length) missing.push("conditions");
    if (!intent.action) missing.push("action");
    const values: RulePlanningValues = {
      ...(name ? { name } : {}),
      priority:
        priority ??
        suggestRulePriority(
          context.rules
            .filter((rule) => rule.status === "ACTIVE")
            .map((rule) => rule.priority),
        ),
      trigger: "TRANSACTION_CREATED",
      ...(conditions ? { conditions } : {}),
      ...(action ? { action } : {}),
    };
    if (
      missing.length === 0 &&
      !ruleDefinitionSchema.safeParse(definitionOf(values)).success
    )
      missing.push("conditions");
    return {
      ...base,
      planningOperation,
      targetId: null,
      expectedUpdatedAt: null,
      label: name,
      candidates: [],
      options,
      values,
      missingFields: ordered(missing),
    };
  }

  const target = requireKnownId(
    intent.ruleId,
    resolveRuleReference(intent, context.rules),
    "Rule not found in this workspace.",
  );
  if (target.status !== "RESOLVED") {
    return {
      ...base,
      planningOperation,
      targetId: null,
      expectedUpdatedAt: null,
      label: null,
      candidates: target.candidates.map(ruleOption),
      options,
      values: {},
      missingFields: ["rule"],
    };
  }

  const rule = target.item;
  let values: RulePlanningValues = {};
  switch (planningOperation) {
    case "RULE_ARCHIVE":
      if (rule.status === "ARCHIVED")
        throw new ConflictError("This rule is already archived.");
      break;
    case "RULE_ENABLE":
    case "RULE_DISABLE":
      if (rule.status === "ARCHIVED")
        throw new ConflictError(
          "Archived rules cannot be enabled or disabled.",
        );
      if (rule.enabled === (planningOperation === "RULE_ENABLE")) {
        throw new ConflictError(
          `This rule is already ${rule.enabled ? "enabled" : "disabled"}.`,
        );
      }
      break;
    case "RULE_EDIT": {
      if (rule.status === "ARCHIVED")
        throw new ConflictError("Archived rules cannot be edited.");
      values = {
        ...(name ? { name } : {}),
        ...(priority === null ? {} : { priority }),
        ...(conditions ? { conditions } : {}),
        ...(action ? { action } : {}),
      };
      if (missing.length > 0) break;
      if (Object.keys(values).length === 0) missing.push("change");
      else if (
        !ruleDefinitionSchema.safeParse(
          planningRuleDefinition({ values }, rule),
        ).success
      )
        missing.push("conditions");
      else if (
        (values.name ?? rule.name) === rule.name &&
        (values.priority ?? rule.priority) === rule.priority &&
        sameJson(values.conditions ?? rule.conditions, rule.conditions) &&
        sameJson(values.action ?? rule.action, rule.action)
      ) {
        throw new ConflictError("This rule already has these values.");
      }
      break;
    }
  }

  return {
    ...base,
    planningOperation,
    targetId: rule.id,
    expectedUpdatedAt: rule.updatedAt.toISOString(),
    label: rule.name,
    candidates: [],
    options,
    values,
    missingFields: ordered(missing),
  };
}

/** The definition the rule will have once the draft is applied; null while it is still incomplete. */
export function planningRuleDefinition(
  draft: Pick<RulePlanningDraft, "values">,
  rule: RuleRecord | null,
): RuleDefinition | null {
  const conditions = draft.values.conditions ?? rule?.conditions;
  const action = draft.values.action ?? rule?.action;
  if (!conditions?.length || !action) return null;
  return {
    trigger: draft.values.trigger ?? rule?.trigger ?? "TRANSACTION_CREATED",
    conditions,
    action,
  };
}

export function presentRuleDryRun(
  result: RuleDraftDryRunResult,
): RulePlanningDryRun {
  const matching = result.transactions.filter(
    (transaction) => transaction.match.matched,
  );
  return {
    evaluatedCount: result.evaluatedCount,
    matchingCount: result.matchingCount,
    wouldApplyCount: matching.filter((transaction) => transaction.wouldApply)
      .length,
    shadowedCount: matching.filter(
      (transaction) => transaction.shadowedBy !== null,
    ).length,
    samples: matching.slice(0, DRY_RUN_SAMPLES).map((transaction) => ({
      transactionId: transaction.transactionId,
      label: transaction.label,
      amount: formatAmount(transaction.amountMinor, transaction.currency),
      occurredAt: transaction.occurredAt,
      wouldApply: transaction.wouldApply,
      reason: transaction.wouldApply
        ? null
        : (transaction.applicability.reason ?? null),
      shadowedBy: transaction.shadowedBy?.name ?? null,
    })),
  };
}

export function completeRulePlanningDraft(
  draft: RulePlanningDraft,
  context: RulePlanningContext,
  dryRun: RulePlanningDryRun | null,
): RulePlanningDraft {
  if (draft.missingFields.length > 0) return draft;
  const rule =
    context.rules.find((candidate) => candidate.id === draft.targetId) ?? null;
  const definition = planningRuleDefinition(draft, rule);
  const name = draft.values.name ?? rule?.name;
  const priority = draft.values.priority ?? rule?.priority;
  if (!definition || !name || priority === undefined) return draft;

  const describe = (current: RuleDefinition) => [
    {
      label: "When a transaction is created and",
      lines: current.conditions.map((condition) =>
        describeCondition(condition, context),
      ),
    },
    { label: "Then", lines: [describeAction(current.action, context)] },
  ];
  const header = { label: null, lines: [name, `Priority ${priority}`] };
  const dryRunSection = dryRun
    ? [
        {
          label: `Dry run on your ${dryRun.evaluatedCount} most recent transactions`,
          lines: [
            `${dryRun.matchingCount} match the conditions`,
            `${dryRun.wouldApplyCount} would be ${definition.action.type === "ASSIGN_CATEGORY" ? "categorized" : "sent for review"}`,
            ...(dryRun.shadowedCount > 0
              ? [
                  `${dryRun.shadowedCount} would be left to a higher-priority rule`,
                ]
              : []),
          ],
        },
      ]
    : [];
  const safety = RULE_SAFETY[definition.action.type];
  const savingOnly =
    "Saving the rule changes no existing transaction, and the dry run changed nothing.";

  const summary = ((): PlanningApprovalSummary => {
    switch (draft.planningOperation) {
      case "RULE_CREATE":
        return approvalSummary(
          "Create rule",
          [header, ...describe(definition), ...dryRunSection],
          [
            safety,
            "The rule is created disabled. It is not evaluated until you enable it.",
            savingOnly,
          ],
        );
      case "RULE_EDIT":
        return approvalSummary(
          "Edit rule",
          [
            { label: null, lines: [rule!.name, `Priority ${rule!.priority}`] },
            { label: "After the edit", lines: header.lines },
            ...describe(definition),
            ...dryRunSection,
          ],
          [safety, savingOnly],
        );
      case "RULE_ENABLE":
        return approvalSummary(
          "Enable rule",
          [header, ...describe(definition), ...dryRunSection],
          [
            safety,
            "Once enabled, the rule is evaluated for new transactions in priority order. Enabling it changes no existing transaction.",
          ],
        );
      case "RULE_DISABLE":
        return approvalSummary(
          "Disable rule",
          [header, ...describe(definition)],
          [
            "The rule is kept but no longer evaluated until it is enabled again.",
            "No Transaction changes, and categories it already assigned stay as they are.",
          ],
        );
      case "RULE_ARCHIVE":
        return approvalSummary(
          "Archive rule",
          [header, ...describe(definition)],
          [
            "The rule is kept for history, is no longer evaluated, and cannot be enabled or edited afterwards.",
            "No Transaction changes, and categories it already assigned stay as they are.",
          ],
        );
    }
  })();
  return { ...draft, dryRun, approvalSummary: summary };
}

/** True when the stored budget is exactly what the approved draft asked for. */
export function persistedBudgetMatches(
  draft: BudgetPlanningDraft,
  record: BudgetRecord | null | undefined,
): boolean {
  if (!record) return false;
  const { values } = draft;
  const valuesMatch =
    (values.scope === undefined || record.scope === values.scope) &&
    (values.categoryId === undefined ||
      record.categoryId === values.categoryId) &&
    (values.subcategoryIds === undefined ||
      sameIds(record.subcategoryIds, values.subcategoryIds)) &&
    (values.amountMinor === undefined ||
      record.amountMinor.toString() === values.amountMinor) &&
    (values.startsOn === undefined ||
      record.startsOn.toISOString() === values.startsOn) &&
    (values.endsOn === undefined ||
      (record.endsOn?.toISOString() ?? null) === values.endsOn);
  switch (draft.planningOperation) {
    case "BUDGET_CREATE":
      return (
        valuesMatch &&
        record.status === "ACTIVE" &&
        record.currency === draft.currency
      );
    case "BUDGET_EDIT":
      return (
        valuesMatch &&
        record.id === draft.targetId &&
        record.status === "ACTIVE"
      );
    case "BUDGET_ARCHIVE":
      return record.id === draft.targetId && record.status === "ARCHIVED";
  }
}

export function persistedGoalMatches(
  draft: GoalPlanningDraft,
  summary: SavingsGoalSummary | null | undefined,
): boolean {
  if (!summary) return false;
  const { goal } = summary;
  const { values } = draft;
  const valuesMatch =
    (values.name === undefined || goal.name === values.name) &&
    (values.targetAmountMinor === undefined ||
      goal.targetAmountMinor.toString() === values.targetAmountMinor) &&
    (values.targetDate === undefined ||
      (goal.targetDate?.toISOString() ?? null) === values.targetDate);
  switch (draft.planningOperation) {
    case "GOAL_CREATE":
      return (
        valuesMatch &&
        goal.currency === draft.currency &&
        goal.currentSavedMinor.toString() === (values.openingSavedMinor ?? "0")
      );
    case "GOAL_EDIT":
      return (
        valuesMatch && goal.id === draft.targetId && goal.status !== "ARCHIVED"
      );
    case "GOAL_ARCHIVE":
      return goal.id === draft.targetId && goal.status === "ARCHIVED";
    case "GOAL_COMPLETE":
      return goal.id === draft.targetId && goal.status === "COMPLETED";
  }
}

/**
 * Verifies a contribution write against the stored history: the new entries
 * exist, the corrected or reversed original is still there, and the saved
 * total is exactly the progress the member approved.
 */
export function persistedContributionMatches(
  draft: ContributionPlanningDraft,
  summary: SavingsGoalSummary | null | undefined,
  history: readonly SavingsGoalContribution[],
  recordedIds: readonly string[],
): boolean {
  if (
    !summary ||
    summary.goal.id !== draft.targetId ||
    draft.savedAfterMinor === null
  )
    return false;
  const stored = new Map(history.map((entry) => [entry.id, entry]));
  if (recordedIds.length === 0 || recordedIds.some((id) => !stored.has(id)))
    return false;
  if (summary.goal.currentSavedMinor.toString() !== draft.savedAfterMinor)
    return false;
  if (draft.planningOperation === "CONTRIBUTION_ADD") {
    const added = stored.get(recordedIds[0]!)!;
    return (
      added.kind === "CONTRIBUTION" &&
      added.amountMinor.toString() === draft.amountMinor
    );
  }
  const original = draft.contributionId
    ? stored.get(draft.contributionId)
    : undefined;
  return (
    original?.kind === "CONTRIBUTION" &&
    original.amountMinor.toString() === draft.originalAmountMinor &&
    history.some(
      (entry) =>
        entry.kind === "REVERSAL" &&
        entry.reversesContributionId === original.id,
    )
  );
}

export function persistedRuleMatches(
  draft: RulePlanningDraft,
  rule: RuleRecord | null | undefined,
): boolean {
  if (!rule) return false;
  const { values } = draft;
  const valuesMatch =
    (values.name === undefined || rule.name === values.name) &&
    (values.priority === undefined || rule.priority === values.priority) &&
    (values.conditions === undefined ||
      sameJson(rule.conditions, values.conditions)) &&
    (values.action === undefined || sameJson(rule.action, values.action));
  switch (draft.planningOperation) {
    case "RULE_CREATE":
      return valuesMatch && rule.status === "ACTIVE" && rule.origin === "AGENT";
    case "RULE_EDIT":
      return (
        valuesMatch && rule.id === draft.targetId && rule.status === "ACTIVE"
      );
    case "RULE_ENABLE":
      return (
        rule.id === draft.targetId && rule.status === "ACTIVE" && rule.enabled
      );
    case "RULE_DISABLE":
      return (
        rule.id === draft.targetId && rule.status === "ACTIVE" && !rule.enabled
      );
    case "RULE_ARCHIVE":
      return (
        rule.id === draft.targetId &&
        rule.status === "ARCHIVED" &&
        !rule.enabled
      );
  }
}

export function presentBudgetResult(
  draft: BudgetPlanningDraft,
  record: BudgetRecord,
  verifiedAt: Date,
): PlanningActionResult {
  return {
    planningOperation: draft.planningOperation,
    entity: "BUDGET",
    budgetId: record.id,
    label: draft.label ?? "Budget",
    amountMinor: record.amountMinor.toString(),
    currency: record.currency,
    subcategoryIds: record.subcategoryIds,
    status: record.status,
    verifiedAt: verifiedAt.toISOString(),
  };
}

export function presentGoalResult(
  draft: GoalPlanningDraft,
  summary: SavingsGoalSummary,
  verifiedAt: Date,
): PlanningActionResult {
  const { goal } = summary;
  return {
    planningOperation: draft.planningOperation,
    entity: "SAVINGS_GOAL",
    goalId: goal.id,
    name: goal.name,
    targetAmountMinor: goal.targetAmountMinor.toString(),
    savedMinor: goal.currentSavedMinor.toString(),
    currency: goal.currency,
    status: goal.status,
    verifiedAt: verifiedAt.toISOString(),
  };
}

export function presentContributionResult(
  draft: ContributionPlanningDraft,
  summary: SavingsGoalSummary,
  history: readonly SavingsGoalContribution[],
  recordedIds: readonly string[],
  verifiedAt: Date,
): PlanningActionResult {
  const { goal } = summary;
  return {
    planningOperation: draft.planningOperation,
    entity: "CONTRIBUTION",
    goalId: goal.id,
    goalName: goal.name,
    recordedContributionIds: recordedIds,
    savedMinor: goal.currentSavedMinor.toString(),
    targetAmountMinor: goal.targetAmountMinor.toString(),
    currency: goal.currency,
    goalStatus: goal.status,
    historyCount: history.length,
    createdTransaction: false,
    changedAccountBalance: false,
    verifiedAt: verifiedAt.toISOString(),
  };
}

export function presentRuleResult(
  draft: RulePlanningDraft,
  rule: RuleRecord,
  verifiedAt: Date,
): PlanningActionResult {
  return {
    planningOperation: draft.planningOperation,
    entity: "RULE",
    ruleId: rule.id,
    name: rule.name,
    priority: rule.priority,
    enabled: rule.enabled,
    status: rule.status,
    action: rule.action,
    verifiedAt: verifiedAt.toISOString(),
  };
}

function requestedSubcategories(
  intent: Pick<BudgetPlanningIntent, "subcategoryNames" | "wholeCategory">,
  categoryId: string,
  categories: readonly LedgerCategoryRecord[],
  missing: PlanningDraftField[],
  options: BudgetPlanningDraft["options"],
): string[] | null {
  const names = (intent.subcategoryNames ?? [])
    .map(cleanOptionalText)
    .filter((name): name is string => name !== null);
  if (names.length === 0) return intent.wholeCategory ? [] : null;
  if (intent.wholeCategory)
    throw new ConflictError(
      "Choose either the whole category or selected subcategories.",
    );
  const children = categories.filter(
    (category) =>
      category.kind === "EXPENSE" && category.parentCategoryId === categoryId,
  );
  const resolved = names.map((name) =>
    resolvePlanName(name, children, (child) => child.name),
  );
  if (resolved.some((entry) => entry.status !== "RESOLVED")) {
    missing.push("subcategories");
    options.subcategories = children.map(({ id, name }) => ({ id, name }));
    return null;
  }
  return [
    ...new Set(
      resolved.map(
        (entry) => (entry as { item: LedgerCategoryRecord }).item.id,
      ),
    ),
  ].sort();
}

function requestedConditions(
  conditions: readonly RuleConditionIntent[],
  context: RulePlanningContext,
  missing: PlanningDraftField[],
  options: RulePlanningDraft["options"],
): RuleCondition[] | null {
  const built: unknown[] = [];
  for (const condition of conditions) {
    const { field, operator } = condition;
    const names = (condition.values ?? [])
      .map(cleanOptionalText)
      .filter((value): value is string => value !== null);
    if (field === "COUNTERPARTY" || field === "NOTE") {
      built.push({ field, operator, value: cleanOptionalText(condition.text) });
      continue;
    }
    if (field === "TRANSACTION_KIND" || field === "ENTRY_ORIGIN") {
      built.push({
        field,
        operator,
        values: names.map((value) => value.toUpperCase()),
      });
      continue;
    }
    if (
      field === "CATEGORY" &&
      (operator === "IS_EMPTY" || operator === "IS_NOT_EMPTY")
    ) {
      built.push({ field, operator, values: [] });
      continue;
    }
    const ids: string[] = [];
    for (const name of names) {
      const located =
        field === "ACCOUNT"
          ? locateAccount(name, context.accounts)
          : resolvePlanName(
              name,
              context.categories,
              (category) => category.name,
            );
      if (located.status === "RESOLVED") ids.push(located.item.id);
      else if (field === "ACCOUNT") {
        if (!missing.includes("conditionAccount"))
          missing.push("conditionAccount");
        options.conditionAccount = context.accounts
          .filter((account) => !account.archivedAt)
          .map(({ id, name: accountName }) => ({ id, name: accountName }));
      } else {
        if (!missing.includes("conditionCategory"))
          missing.push("conditionCategory");
        options.conditionCategory = context.categories.map((category) =>
          categoryOption(category, context.categories),
        );
      }
    }
    built.push({ field, operator, values: ids });
  }
  if (
    missing.includes("conditionAccount") ||
    missing.includes("conditionCategory")
  )
    return null;
  const parsed = ruleDefinitionSchema.safeParse({
    trigger: "TRANSACTION_CREATED",
    conditions: built,
    action: { type: "ROUTE_FOR_REVIEW" },
  });
  if (!parsed.success) {
    missing.push("conditions");
    return null;
  }
  return [...parsed.data.conditions];
}

function locateAccount(
  name: string,
  accounts: readonly LedgerAccountRecord[],
): PlanReferenceResolution<LedgerAccountRecord> {
  const resolution = resolveAccountReference(
    { accountName: name },
    accounts.filter((account) => !account.archivedAt),
  );
  return resolution.status === "RESOLVED"
    ? { status: "RESOLVED", item: resolution.account }
    : { status: resolution.status, candidates: resolution.candidates };
}

function requestedAction(
  action: NonNullable<RulePlanningIntent["action"]>,
  context: RulePlanningContext,
  missing: PlanningDraftField[],
  options: RulePlanningDraft["options"],
): RuleAction | null {
  if (action.type === "ROUTE_FOR_REVIEW") return { type: "ROUTE_FOR_REVIEW" };
  const category = resolvePlanName(
    action.categoryName,
    context.categories,
    (candidate) => candidate.name,
  );
  if (category.status === "RESOLVED")
    return { type: "ASSIGN_CATEGORY", categoryId: category.item.id };
  missing.push("actionCategory");
  options.actionCategory = category.candidates.map((candidate) =>
    categoryOption(candidate, context.categories),
  );
  return null;
}

function locateContribution(
  intent: ContributionPlanningIntent,
  currency: string,
  contributions: readonly AgentContributionView[],
): PlanReferenceResolution<AgentContributionView> {
  if (intent.contributionId) {
    const entry = contributions.find(
      (candidate) => candidate.id === intent.contributionId,
    );
    if (!entry) throw new NotFoundError("Savings-goal contribution not found.");
    if (!entry.canCorrect) {
      throw new ConflictError(
        entry.isReversed
          ? "Savings-goal contribution has already been reversed."
          : "Only a contribution can be corrected or reversed, not a reversal entry.",
      );
    }
    return { status: "RESOLVED", item: entry };
  }
  const adjustable = contributions.filter((entry) => entry.canCorrect);
  const amountText = cleanOptionalText(intent.contributionAmountText);
  if (amountText) {
    const amountMinor = parsePlanningAmount(
      amountText,
      currency,
      "This savings goal",
    );
    const matched = adjustable.filter(
      (entry) => entry.amount.minorUnits === amountMinor,
    );
    if (matched.length === 1) return { status: "RESOLVED", item: matched[0]! };
    return matched.length > 1
      ? { status: "AMBIGUOUS", candidates: matched }
      : { status: "NOT_FOUND", candidates: adjustable };
  }
  if (intent.latestContribution) {
    const latest = adjustable.at(-1);
    return latest
      ? { status: "RESOLVED", item: latest }
      : { status: "NOT_FOUND", candidates: [] };
  }
  return { status: "NOT_FOUND", candidates: adjustable };
}

function requestedAmount(
  amountText: string | null | undefined,
  currency: string,
  subject: string,
  field: PlanningDraftField,
  missing: PlanningDraftField[],
): string | null {
  const text = cleanOptionalText(amountText);
  if (!text) return null;
  const amountMinor = parsePlanningAmount(text, currency, subject);
  if (!amountMinor) missing.push(field);
  return amountMinor;
}

/**
 * An amount may carry its own currency code. A code that differs from the
 * plan's currency is refused rather than converted: Pace has no FX strategy.
 */
export function parsePlanningAmount(
  amountText: string,
  currency: string,
  subject: string,
): string | null {
  const match = /^(?:([A-Za-z]{3})\s+)?(.+?)(?:\s*([A-Za-z]{3}))?$/.exec(
    amountText.trim(),
  );
  const code = (match?.[1] ?? match?.[3])?.toUpperCase();
  if (!match || !code || !isCurrencyCode(code))
    return parseAmountToMinor(amountText, currency);
  assertSameCurrency(code, currency, subject);
  return parseAmountToMinor(match[2]!, currency);
}

function assertSameCurrency(
  requested: string | null | undefined,
  currency: string,
  subject: string,
): void {
  const code = cleanOptionalText(requested)?.toUpperCase();
  if (!code || code === currency) return;
  throw new ConflictError(
    `${subject} ${subject.startsWith("This") ? "uses" : "use"} ${currency}. Pace does not convert currencies, so an amount in ${code} cannot be used.`,
  );
}

function requestedDate(
  value: string | null | undefined,
  timezone: string,
  time: { hour: number; minute: number },
  field: PlanningDraftField,
  missing: PlanningDraftField[],
): string | null {
  const text = cleanOptionalText(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const [year, month, day] = match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [0, 0, 0];
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    !match ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    missing.push(field);
    return null;
  }
  return zonedLocalDateTimeToInstant(
    { year, month, day },
    time,
    timezone,
  ).toISOString();
}

function monthPeriod(
  month: string,
  timezone: string,
): { startsOn: string; endsOn: string } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const [year, monthNumber] = [Number(match[1]), Number(match[2])];
  const midnight = { hour: 0, minute: 0 };
  return {
    startsOn: zonedLocalDateTimeToInstant(
      { year, month: monthNumber, day: 1 },
      midnight,
      timezone,
    ).toISOString(),
    endsOn: zonedLocalDateTimeToInstant(
      {
        year: monthNumber === 12 ? year + 1 : year,
        month: monthNumber === 12 ? 1 : monthNumber + 1,
        day: 1,
      },
      midnight,
      timezone,
    ).toISOString(),
  };
}

function currentMonth(now: Date, timezone: string): string {
  return localMonth(now, timezone);
}

function localMonth(instant: Date, timezone: string): string {
  const local = localDateForInstant(instant, timezone);
  return `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}`;
}

function dayOf(instant: string, timezone: string): string {
  const local = localDateForInstant(new Date(instant), timezone);
  return `${localMonth(new Date(instant), timezone)}-${local.day.toString().padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function budgetPeriodLabel(budget: AgentBudgetView): string {
  if (budget.lastMonth === null) return `From ${monthLabel(budget.firstMonth)}`;
  return budget.lastMonth === budget.firstMonth
    ? monthLabel(budget.firstMonth)
    : `${monthLabel(budget.firstMonth)} – ${monthLabel(budget.lastMonth)}`;
}

function formatNumber(amountMinor: string, currency: string): string {
  return formatAmount(amountMinor, currency).slice(0, -(currency.length + 1));
}

function describeCondition(
  condition: RuleCondition,
  context: RulePlanningContext,
): string {
  const prefix = `${CONDITION_FIELDS[condition.field]} ${CONDITION_OPERATORS[condition.operator]}`;
  switch (condition.field) {
    case "COUNTERPARTY":
    case "NOTE":
      return condition.value ? `${prefix} "${condition.value}"` : prefix;
    case "ACCOUNT":
      return `${prefix}: ${condition.values
        .map(
          (id) =>
            context.accounts.find((account) => account.id === id)?.name ??
            "Unknown account",
        )
        .join(", ")}`;
    case "CATEGORY":
      return condition.values.length === 0
        ? prefix
        : `${prefix}: ${condition.values.map((id) => categoryName(id, context)).join(", ")}`;
    default:
      return `${prefix}: ${condition.values.map((value) => value.charAt(0) + value.slice(1).toLowerCase()).join(", ")}`;
  }
}

function describeAction(
  action: RuleAction,
  context: RulePlanningContext,
): string {
  return action.type === "ASSIGN_CATEGORY"
    ? `Assign category ${categoryName(action.categoryId, context)}`
    : "Send to the Inbox for review";
}

function categoryName(id: string, context: RulePlanningContext): string {
  return (
    context.categories.find((category) => category.id === id)?.name ??
    "Unknown category"
  );
}

function definitionOf(values: RulePlanningValues): Partial<RuleDefinition> {
  return {
    trigger: values.trigger,
    conditions: values.conditions,
    action: values.action,
  };
}

function approvalSummary(
  title: string,
  sections: PlanningApprovalSummary["sections"],
  effects: readonly string[],
): PlanningApprovalSummary {
  const blocks = sections.map((section) =>
    [...(section.label ? [`${section.label}:`] : []), ...section.lines].join(
      "\n",
    ),
  );
  return {
    title,
    sections,
    effects,
    text: [title, ...blocks, ["Important:", ...effects].join("\n")].join(
      "\n\n",
    ),
  };
}

function budgetOption(budget: AgentBudgetView): PlanningDraftOption {
  return {
    id: budget.id,
    name: budget.label,
    detail: `${budgetPeriodLabel(budget)} · ${formatAmount(budget.amount.minorUnits, budget.amount.currency)} · ${budget.status}`,
  };
}

function goalOption(goal: AgentGoalView): PlanningDraftOption {
  return {
    id: goal.id,
    name: goal.name,
    detail: `${formatAmount(goal.saved.minorUnits, goal.saved.currency)} of ${formatAmount(goal.target.minorUnits, goal.target.currency)} · ${goal.status}`,
  };
}

function ruleOption(rule: RuleRecord): PlanningDraftOption {
  return {
    id: rule.id,
    name: rule.name,
    detail: `Priority ${rule.priority} · ${rule.status === "ARCHIVED" ? "ARCHIVED" : rule.enabled ? "ENABLED" : "DISABLED"}`,
  };
}

function contributionOption(
  entry: AgentContributionView,
  timezone: string,
): PlanningDraftOption {
  return {
    id: entry.id,
    name: `${formatAmount(entry.amount.minorUnits, entry.amount.currency)} on ${dayOf(entry.effectiveAt, timezone)}`,
    ...(entry.note ? { detail: entry.note } : {}),
  };
}

function categoryOption(
  category: LedgerCategoryRecord,
  categories: readonly LedgerCategoryRecord[],
): PlanningDraftOption {
  const parent = category.parentCategoryId
    ? categories.find((candidate) => candidate.id === category.parentCategoryId)
    : null;
  return {
    id: category.id,
    name: category.name,
    ...(parent ? { detail: `In ${parent.name}` } : {}),
  };
}

function requireKnownId<TItem>(
  id: string | null | undefined,
  resolution: PlanReferenceResolution<TItem>,
  message: string,
): PlanReferenceResolution<TItem> {
  if (id && resolution.status !== "RESOLVED") throw new NotFoundError(message);
  return resolution;
}

function ordered(fields: readonly PlanningDraftField[]): PlanningDraftField[] {
  return PLANNING_DRAFT_FIELDS.filter((field) => fields.includes(field));
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().join() === [...right].sort().join()
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
