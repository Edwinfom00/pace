import { localDateForInstant, periodForLocalDates } from "@/money/period";
import type { LedgerCategoryRecord } from "@/modules/ledger/domain";
import type { BudgetRecord, BudgetScope, BudgetStatus, SavingsGoalRecord, SavingsGoalStatus } from "@/modules/plans/domain";

import type { BudgetDraft, BudgetDraftField, PlanDraft, SavingsGoalDraft, SavingsGoalDraftField } from "./domain";
import { parseAmountToMinor } from "./transaction-draft";

export interface PlanDraftIntent {
  actionType: "BUDGET_CREATE" | "BUDGET_UPDATE" | "SAVINGS_GOAL_CREATE" | "SAVINGS_GOAL_UPDATE";
  budgetId?: string | null;
  goalId?: string | null;
  scope?: BudgetScope | null;
  categoryId?: string | null;
  amountText?: string | null;
  startsOnText?: string | null;
  endsOnText?: string | null;
  budgetStatus?: BudgetStatus | null;
  name?: string | null;
  targetAmountText?: string | null;
  currentSavedText?: string | null;
  targetDateText?: string | null;
  clearTargetDate?: boolean | null;
  goalStatus?: SavingsGoalStatus | null;
  sourceText?: string | null;
}

export interface PlanDraftContext {
  currency: string;
  timezone: string;
  categories: readonly LedgerCategoryRecord[];
  budgets: readonly BudgetRecord[];
  savingsGoals: readonly SavingsGoalRecord[];
  now?: Date;
}

/**
 * The model supplies only extracted text and ids it received from context.
 * Server code parses amounts and dates, applies defaults, and keeps unknown
 * targets incomplete so a model cannot turn a guess into a mutation.
 */
export function buildPlanDraft(intent: PlanDraftIntent, context: PlanDraftContext): PlanDraft {
  switch (intent.actionType) {
    case "BUDGET_CREATE":
      return buildBudgetDraft("CREATE", null, intent, context);
    case "BUDGET_UPDATE": {
      const budget = intent.budgetId
        ? context.budgets.find((candidate) => candidate.id === intent.budgetId) ?? null
        : null;
      return buildBudgetDraft("UPDATE", budget, intent, context);
    }
    case "SAVINGS_GOAL_CREATE":
      return buildSavingsGoalDraft("CREATE", null, intent, context);
    case "SAVINGS_GOAL_UPDATE": {
      const goal = intent.goalId
        ? context.savingsGoals.find((candidate) => candidate.id === intent.goalId) ?? null
        : null;
      return buildSavingsGoalDraft("UPDATE", goal, intent, context);
    }
  }
}

function buildBudgetDraft(
  operation: BudgetDraft["operation"],
  existing: BudgetRecord | null,
  intent: PlanDraftIntent,
  context: PlanDraftContext,
): BudgetDraft {
  const suppliedScope = intent.scope === "OVERALL" || intent.scope === "CATEGORY" ? intent.scope : null;
  const categoryId = resolveExpenseCategory(intent.categoryId, context.categories) ?? existing?.categoryId ?? null;
  const scope = suppliedScope ?? existing?.scope ?? (categoryId ? "CATEGORY" : null);
  const amountText = cleanOptionalText(intent.amountText) ?? (existing ? existing.amountMinor.toString() : null);
  const amountMinor = amountText ? parseAmountToMinor(amountText, context.currency) : null;
  const hasStartInput = intent.startsOnText !== undefined;
  const startsOn = hasStartInput
    ? parseBudgetStart(intent.startsOnText, context.timezone)
    : existing?.startsOn.toISOString() ?? currentMonthStart(context.timezone, context.now ?? new Date());
  const endsOn = intent.endsOnText === undefined
    ? existing?.endsOn?.toISOString() ?? null
    : parseBudgetEnd(intent.endsOnText, context.timezone);
  const status = intent.budgetStatus ?? existing?.status ?? "ACTIVE";
  const missingFields: BudgetDraftField[] = [];
  if (operation === "UPDATE" && !existing) missingFields.push("budget");
  if (!amountMinor) missingFields.push("amount");
  if (!scope || (scope === "CATEGORY" && !categoryId)) missingFields.push("category");
  if (!startsOn || (intent.endsOnText !== undefined && cleanOptionalText(intent.endsOnText) && !endsOn)) {
    missingFields.push("period");
  }
  return {
    planType: "BUDGET",
    operation,
    budgetId: existing?.id ?? null,
    scope,
    categoryId: scope === "OVERALL" ? null : categoryId,
    amountMinor,
    amountText,
    startsOn,
    endsOn,
    status,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields,
  };
}

function buildSavingsGoalDraft(
  operation: SavingsGoalDraft["operation"],
  existing: SavingsGoalRecord | null,
  intent: PlanDraftIntent,
  context: PlanDraftContext,
): SavingsGoalDraft {
  const name = cleanOptionalText(intent.name) ?? existing?.name ?? null;
  const targetAmountText = cleanOptionalText(intent.targetAmountText) ?? (existing ? existing.targetAmountMinor.toString() : null);
  const targetAmountMinor = targetAmountText ? parseAmountToMinor(targetAmountText, context.currency) : null;
  const currentSavedText = cleanOptionalText(intent.currentSavedText) ?? (existing ? existing.currentSavedMinor.toString() : "0");
  const currentSavedMinor = currentSavedText ? parseAmountToMinorOrZero(currentSavedText, context.currency) : null;
  const targetDate = intent.clearTargetDate
    ? null
    : intent.targetDateText === undefined
      ? existing?.targetDate?.toISOString() ?? null
      : parseGoalDate(intent.targetDateText, context.timezone);
  const status = intent.goalStatus ?? existing?.status ?? "ACTIVE";
  const missingFields: SavingsGoalDraftField[] = [];
  if (operation === "UPDATE" && !existing) missingFields.push("goal");
  if (!name) missingFields.push("name");
  if (!targetAmountMinor) missingFields.push("targetAmount");
  if (currentSavedMinor === null) missingFields.push("currentSaved");
  if (intent.targetDateText !== undefined && cleanOptionalText(intent.targetDateText) && !targetDate) {
    missingFields.push("targetDate");
  }
  return {
    planType: "SAVINGS_GOAL",
    operation,
    goalId: existing?.id ?? null,
    name,
    targetAmountMinor,
    targetAmountText,
    currentSavedMinor,
    currentSavedText,
    targetDate,
    status,
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields,
  };
}

function resolveExpenseCategory(
  categoryId: string | null | undefined,
  categories: readonly LedgerCategoryRecord[],
): string | null {
  if (!categoryId) return null;
  return categories.some((category) => category.id === categoryId && category.kind === "EXPENSE")
    ? categoryId
    : null;
}

function parseBudgetStart(value: string | null | undefined, timezone: string): string | null {
  const normalized = cleanOptionalText(value);
  if (!normalized) return null;
  const day = /^\d{4}-\d{2}$/.test(normalized) ? `${normalized}-01` : normalized;
  return dateStart(day, timezone);
}

function parseBudgetEnd(value: string | null | undefined, timezone: string): string | null {
  const normalized = cleanOptionalText(value);
  if (!normalized) return null;
  if (/^\d{4}-\d{2}$/.test(normalized)) {
    const [year, month] = normalized.split("-").map(Number);
    if (!year || !month) return null;
    const next = new Date(Date.UTC(year, month, 1));
    const day = `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1)
      .toString()
      .padStart(2, "0")}-01`;
    return dateStart(day, timezone);
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  const day = parsed.toISOString().slice(0, 10);
  return dateStart(day, timezone);
}

function parseGoalDate(value: string | null | undefined, timezone: string): string | null {
  const normalized = cleanOptionalText(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const start = dateStart(normalized, timezone);
  return start ? new Date(start).toISOString() : null;
}

function currentMonthStart(timezone: string, now: Date): string {
  const local = localDateForInstant(now, timezone);
  const day = `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}-01`;
  return dateStart(day, timezone) ?? new Date(Date.UTC(local.year, local.month - 1, 1)).toISOString();
}

function dateStart(day: string, timezone: string): string | null {
  try {
    const date = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    return periodForLocalDates(day, next.toISOString().slice(0, 10), timezone).start.toISOString();
  } catch {
    return null;
  }
}

function parseAmountToMinorOrZero(amountText: string, currency: string): string | null {
  if (/^0(?:\.0+)?$/.test(amountText.trim())) return "0";
  return parseAmountToMinor(amountText, currency);
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const cleaned = value?.normalize("NFKC").trim().replaceAll(/\s+/g, " ");
  return cleaned ? cleaned : null;
}
