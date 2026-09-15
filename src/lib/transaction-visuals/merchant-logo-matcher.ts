import {
  getMerchantLogoDefinition,
  isMerchantLogoKey,
  MERCHANT_LOGO_CATALOG,
  type MerchantLogoCatalogEntry,
} from "./merchant-logo-catalog";
import { normalizeTransactionVisualText } from "./transaction-icon-matcher";

export interface ResolveMerchantLogoInput {
  readonly merchantName?: string | null;
  readonly merchantLogoKey?: string | null;
}

const knownMerchantTerms = MERCHANT_LOGO_CATALOG.flatMap((definition) =>
  [...new Set(definition.aliases)]
    .map((term) => ({ definition, term: normalizeTransactionVisualText(term) }))
    // Do not promote short abbreviations such as "X", "HP", or "LG" to a brand logo.
    .filter(({ term }) => term.length >= 3),
).sort((left, right) => right.term.length - left.term.length);


export function resolveMerchantLogo(
  input: ResolveMerchantLogoInput,
): MerchantLogoCatalogEntry | null {
  if (isMerchantLogoKey(input.merchantLogoKey)) {
    return getMerchantLogoDefinition(input.merchantLogoKey);
  }

  const merchant = normalizeTransactionVisualText(input.merchantName ?? "");
  if (!merchant) return null;

  return knownMerchantTerms.find(({ term }) => hasWholePhrase(merchant, term))?.definition ?? null;
}

function hasWholePhrase(value: string, phrase: string): boolean {
  return Boolean(phrase && ` ${value} `.includes(` ${phrase} `));
}
