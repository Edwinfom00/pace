import { countries, getEmojiFlag, type TCountryCode, type TCurrencyCode } from "countries-list";
import { currencies } from "countries-list/currencies";

export const ONBOARDING_LANGUAGES = ["en", "fr", "de"] as const;
export type OnboardingLanguage = (typeof ONBOARDING_LANGUAGES)[number];

export type CountryMetadata = {
  code: string;
  englishName: string;
  flag: string;
  currencyCodes: string[];
};

export type CurrencyMetadata = {
  code: string;
  englishName: string;
  nativeName: string;
  symbol: string;
};

/**
 * `countries-list` provides all 252 ISO region records, ISO 4217 currencies,
 * and ISO language metadata. Display names are localized through Intl while
 * these stable codes remain the values we persist.
 */
export const COUNTRY_METADATA: CountryMetadata[] = Object.entries(countries)
  .map(([code, country]) => ({
    code,
    englishName: country.name,
    flag: getEmojiFlag(code as TCountryCode),
    currencyCodes: country.currency,
  }))
  .sort((left, right) => left.englishName.localeCompare(right.englishName));

export const CURRENCY_METADATA: CurrencyMetadata[] = Object.entries(currencies)
  .filter(([code, currency]) => code !== "XXX" && !currency.withdrawn)
  .map(([code, currency]) => ({
    code,
    englishName: currency.name,
    nativeName: currency.native,
    symbol: currency.symbol,
  }))
  .sort((left, right) => left.code.localeCompare(right.code));

export function isSupportedCountry(value: string): boolean {
  return Object.hasOwn(countries, value);
}

export function isSupportedCurrency(value: string): boolean {
  return Object.hasOwn(currencies, value) && value !== "XXX" && !currencies[value as TCurrencyCode].withdrawn;
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

export function getCountryDefaultCurrency(countryCode: string): string | null {
  const country = countries[countryCode as TCountryCode];
  const candidate = country?.currency.find((code) => isSupportedCurrency(code));
  return candidate ?? null;
}

export function getLocalizedCountryName(countryCode: string, language: OnboardingLanguage): string {
  const fallback = countries[countryCode as TCountryCode]?.name ?? countryCode;

  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(countryCode) ?? fallback;
  } catch {
    return fallback;
  }
}

export function getLocalizedCurrencyName(currencyCode: string, language: OnboardingLanguage): string {
  const fallback = currencies[currencyCode as TCurrencyCode]?.name ?? currencyCode;

  try {
    return new Intl.DisplayNames([language], { type: "currency" }).of(currencyCode) ?? fallback;
  } catch {
    return fallback;
  }
}

export function getSupportedTimezones(): string[] {
  if (typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone");
  }

  return ["Africa/Douala", "Europe/Paris", "Europe/Berlin", "America/New_York"];
}
