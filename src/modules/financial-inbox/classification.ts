import type { LedgerCategoryKind, LedgerCategoryRecord } from "@/modules/ledger/domain";

import type { ClassificationRuleRecord, ClassificationSource } from "./domain";

export const HIGH_CONFIDENCE_THRESHOLD = 0.9;

export interface AiClassificationSuggestion {
  categoryId: string;
  confidence: number;
  explanation: string;
}

export interface ClassificationDecision {
  normalizedMerchant: string | null;
  categoryId: string | null;
  source: ClassificationSource;
  confidence: number;
  explanation: Record<string, unknown>;
  requiresReview: boolean;
  merchantAmbiguous: boolean;
}

export interface ClassifyMerchantInput {
  kind: LedgerCategoryKind;
  merchantName: string | null;
  existingCategoryId: string | null;
  /** A category selected on a human-authored manual entry, not an agent default. */
  existingCategoryIsAuthoritative?: boolean;
  categories: readonly LedgerCategoryRecord[];
  userRules: readonly ClassificationRuleRecord[];
  aiSuggestion?: AiClassificationSuggestion | null;
}

/**
 * Stable, locale-independent key used only for matching user rules and
 * deterministic merchant catalog entries. The display merchant name remains
 * untouched in the ledger.
 */
export function normalizeMerchantRuleKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ")
    .slice(0, 160);
}

export function classifyMerchant(input: ClassifyMerchantInput): ClassificationDecision {
  const normalizedMerchant = normalizeMerchantRuleKey(input.merchantName) || null;
  const eligibleCategories = input.categories.filter((category) => category.kind === input.kind);

  const userRule = normalizedMerchant
    ? findMatchingRule(normalizedMerchant, input.kind, input.userRules)
    : null;
  if (userRule) {
    return decision(normalizedMerchant, userRule.categoryId, "USER_RULE", 1, {
      code: "user_rule",
      normalizedMerchant: userRule.normalizedMerchant,
      ruleId: userRule.id,
    });
  }

  const knownCategory = normalizedMerchant
    ? findKnownMerchantCategory(normalizedMerchant, input.kind, eligibleCategories)
    : null;
  if (knownCategory) {
    return decision(normalizedMerchant, knownCategory.id, "DETERMINISTIC", 0.92, {
      code: "known_merchant",
      normalizedMerchant,
      systemKey: knownCategory.systemKey,
    });
  }

  const aiSuggestion = input.aiSuggestion;
  if (aiSuggestion) {
    const category = eligibleCategories.find((candidate) => candidate.id === aiSuggestion.categoryId);
    if (category) {
      const confidence = clampConfidence(aiSuggestion.confidence);
      return decision(normalizedMerchant, category.id, "AI_SUGGESTION", confidence, {
        code: "ai_suggestion",
        explanation: aiSuggestion.explanation.slice(0, 500),
      });
    }
  }

  if (
    input.existingCategoryIsAuthoritative &&
    input.existingCategoryId &&
    eligibleCategories.some((category) => category.id === input.existingCategoryId)
  ) {
    return decision(normalizedMerchant, input.existingCategoryId, "EXISTING_LEDGER", 1, {
      code: "existing_ledger_category",
    });
  }

  return decision(normalizedMerchant, null, "UNCLASSIFIED", 0, {
    code: normalizedMerchant ? "no_safe_match" : "merchant_missing",
  });
}

function decision(
  normalizedMerchant: string | null,
  categoryId: string | null,
  source: ClassificationSource,
  confidence: number,
  explanation: Record<string, unknown>,
): ClassificationDecision {
  return {
    normalizedMerchant,
    categoryId,
    source,
    confidence,
    explanation,
    requiresReview: !categoryId || confidence < HIGH_CONFIDENCE_THRESHOLD,
    // Conflicting exact user rules are prevented by a database uniqueness
    // constraint. Keep this explicit contract for callers and future rules.
    merchantAmbiguous: false,
  };
}

function findMatchingRule(
  normalizedMerchant: string,
  kind: LedgerCategoryKind,
  rules: readonly ClassificationRuleRecord[],
): ClassificationRuleRecord | null {
  return (
    rules
      .filter(
        (rule) =>
          rule.kind === kind &&
          (normalizedMerchant === rule.normalizedMerchant ||
            normalizedMerchant.startsWith(`${rule.normalizedMerchant} `)),
      )
      .sort((left, right) => right.normalizedMerchant.length - left.normalizedMerchant.length)[0] ?? null
  );
}

function findKnownMerchantCategory(
  normalizedMerchant: string,
  kind: LedgerCategoryKind,
  categories: readonly LedgerCategoryRecord[],
): LedgerCategoryRecord | null {
  const known =
    kind === "EXPENSE" && ["yango", "uber", "bolt"].some(
      (name) => normalizedMerchant === name || normalizedMerchant.startsWith(`${name} `),
    )
      ? "expense:transport"
      : null;
  return known ? categories.find((category) => category.systemKey === known) ?? null : null;
}

function clampConfidence(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
