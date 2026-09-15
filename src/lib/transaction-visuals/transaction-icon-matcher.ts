import {
  getTransactionIconDefinition,
  isTransactionIconKey,
  TRANSACTION_ICON_CATALOG,
} from "./transaction-icon-catalog";
import type {
  TransactionIconKey,
  TransactionIconResolution,
} from "./transaction-icon.types";

export interface ResolveTransactionIconInput {
  readonly iconKey?: string | null;
  readonly merchantName?: string | null;
  readonly categoryName?: string | null;
  readonly categoryKey?: string | null;
  readonly transactionKind?: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | string | null;
}

const knownMerchantSemanticRules: readonly {
  readonly iconKey: TransactionIconKey;
  readonly phrases: readonly string[];
}[] = [
  { iconKey: "supermarket", phrases: ["carrefour", "aldi", "lidl", "shoprite", "walmart"] },
  { iconKey: "ride-hailing", phrases: ["yango", "uber", "bolt", "grab", "didi"] },
  { iconKey: "music", phrases: ["spotify", "apple music", "deezer"] },
  { iconKey: "streaming", phrases: ["netflix", "disney plus", "prime video", "showmax"] },
  { iconKey: "mobile-money", phrases: ["mtn momo", "orange money", "m pesa", "mpesa", "wave"] },
  { iconKey: "airtime", phrases: ["mtn", "orange", "airtel", "vodacom", "telcel", "glo", "safaricom"] },
  { iconKey: "online-shopping", phrases: ["amazon", "jumia", "mercado libre", "shopee"] },
  { iconKey: "pharmacy", phrases: ["pharmacy", "chemist"] },
];

const catalogTerms = TRANSACTION_ICON_CATALOG.flatMap((definition) =>
  [...new Set(definition.aliases)]
    .map((term) => ({ definition, term: normalizeTransactionVisualText(term) }))
    .filter(({ term }) => term.length > 2),
).sort((left, right) => right.term.length - left.term.length);

export function normalizeTransactionVisualText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function resolveTransactionIcon(input: ResolveTransactionIconInput): TransactionIconResolution {
  if (isTransactionIconKey(input.iconKey)) {
    return resolution(input.iconKey, "explicit");
  }

  const merchant = normalizeTransactionVisualText(input.merchantName ?? "");
  const merchantRule = knownMerchantSemanticRules.find((rule) =>
    rule.phrases.some((phrase) => hasWholePhrase(merchant, normalizeTransactionVisualText(phrase))),
  );
  if (merchantRule) return resolution(merchantRule.iconKey, "merchant");

  const merchantMatch = findCatalogMatch(merchant);
  if (merchantMatch) return resolution(merchantMatch, "merchant");

  if (isTransactionIconKey(input.categoryKey)) {
    return resolution(input.categoryKey, "category-key");
  }

  const categoryKeyMatch = findCatalogMatch(normalizeTransactionVisualText(input.categoryKey ?? ""));
  if (categoryKeyMatch) return resolution(categoryKeyMatch, "category-key");

  const categoryNameMatch = findCatalogMatch(normalizeTransactionVisualText(input.categoryName ?? ""));
  if (categoryNameMatch) return resolution(categoryNameMatch, "category-name");

  switch (input.transactionKind) {
    case "EXPENSE":
      return resolution("generic-expense", "kind");
    case "INCOME":
      return resolution("generic-income", "kind");
    case "TRANSFER":
      return resolution("generic-transfer", "kind");
    case "REFUND":
      return resolution("generic-refund", "kind");
    default:
      return resolution("generic-transaction", "fallback");
  }
}

function findCatalogMatch(normalizedValue: string): TransactionIconKey | null {
  if (!normalizedValue) return null;
  return catalogTerms.find(({ term }) => hasWholePhrase(normalizedValue, term))?.definition.key ?? null;
}

function hasWholePhrase(value: string, phrase: string): boolean {
  return Boolean(phrase && ` ${value} `.includes(` ${phrase} `));
}

function resolution(
  iconKey: TransactionIconKey,
  source: TransactionIconResolution["source"],
): TransactionIconResolution {
  const definition = getTransactionIconDefinition(iconKey);
  return {
    iconKey,
    iconPath: definition.path,
    category: definition.category,
    source,
  };
}
