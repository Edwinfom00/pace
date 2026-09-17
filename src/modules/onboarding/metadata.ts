import { countries, getEmojiFlag, type TCountryCode } from "countries-list";

import {
  CURRENCY_CATALOG,
  getLocalizedCurrencyName,
  isCurrencyCode,
  toCurrencyCode,
  type CurrencyCode,
  type CurrencyMetadata,
} from "@/money/currency";

export const ONBOARDING_LANGUAGES = ["en", "fr", "de"] as const;
export type OnboardingLanguage = (typeof ONBOARDING_LANGUAGES)[number];

export type CountryMetadata = {
  code: string;
  englishName: string;
  flag: string;
  currencyCodes: string[];
};

export type { CurrencyMetadata } from "@/money/currency";


export const COUNTRY_METADATA: CountryMetadata[] = Object.entries(countries)
  .map(([code, country]) => ({
    code,
    englishName: country.name,
    flag: getEmojiFlag(code as TCountryCode),
    currencyCodes: country.currency,
  }))
  .sort((left, right) => left.englishName.localeCompare(right.englishName));

/** @deprecated Import CURRENCY_CATALOG from @/money/currency in new code. */
export const CURRENCY_METADATA: readonly CurrencyMetadata[] = CURRENCY_CATALOG;

export function isSupportedCountry(value: string): boolean {
  return Object.hasOwn(countries, value);
}

export function isSupportedCurrency(value: string): value is CurrencyCode {
  return isCurrencyCode(value);
}

export function isSupportedOnboardingLanguage(value: string): value is OnboardingLanguage {
  return (ONBOARDING_LANGUAGES as readonly string[]).includes(value);
}

export function isSupportedTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getCountryDefaultCurrency(countryCode: string): CurrencyCode | null {
  const country = countries[countryCode as TCountryCode];
  const candidate = country?.currency.find((code) => isSupportedCurrency(code));
  return candidate ? toCurrencyCode(candidate) : null;
}

export function getLocalizedCountryName(countryCode: string, language: OnboardingLanguage): string {
  const fallback = countries[countryCode as TCountryCode]?.name ?? countryCode;

  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(countryCode) ?? fallback;
  } catch {
    return fallback;
  }
}

export { getLocalizedCurrencyName };

export function getSupportedTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return ["Africa/Douala", "Europe/Paris", "Europe/Berlin", "America/New_York"];
}
