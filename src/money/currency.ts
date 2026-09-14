
const TWO_DECIMAL_CODES = [
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD",
  "BDT", "BGN", "BIF", "BMD", "BND", "BOB", "BOV", "BRL", "BSD", "BTN", "BWP", "BYN",
  "BZD", "CAD", "CDF", "CHE", "CHF", "CHW", "CNY", "COP", "COU", "CRC", "CUP", "CVE",
  "CZK", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL",
  "GHS", "GIP", "GMD", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS",
  "INR", "IRR", "ISK", "JMD", "KES", "KGS", "KHR", "KPW", "KYD", "KZT", "LAK", "LBP",
  "LKR", "LRD", "LSL", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR",
  "MVR", "MWK", "MXN", "MXV", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD",
  "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "QAR", "RON", "RSD", "RUB", "SAR", "SBD",
  "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP",
  "SZL", "THB", "TJS", "TMT", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "USD", "USN",
  "UYU", "UZS", "VED", "VES", "WST", "YER", "ZAR", "ZMW", "ZWG", "ZWL",
] as const;

const ZERO_DECIMAL_CODES = [
  "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV",
  "XAF", "XOF", "XPF",
] as const;

const THREE_DECIMAL_CODES = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"] as const;
const FOUR_DECIMAL_CODES = ["CLF", "UYW"] as const;

const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  ...Object.fromEntries(TWO_DECIMAL_CODES.map((code) => [code, 2])),
  ...Object.fromEntries(ZERO_DECIMAL_CODES.map((code) => [code, 0])),
  ...Object.fromEntries(THREE_DECIMAL_CODES.map((code) => [code, 3])),
  ...Object.fromEntries(FOUR_DECIMAL_CODES.map((code) => [code, 4])),
});

declare const currencyCodeBrand: unique symbol;
export type CurrencyCode = string & { readonly [currencyCodeBrand]: true };

export class UnsupportedCurrencyError extends Error {
  constructor(currency: string) {
    super(`Unsupported ISO 4217 currency: ${currency}.`);
    this.name = "UnsupportedCurrencyError";
  }
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.hasOwn(CURRENCY_MINOR_UNITS, value);
}

export function toCurrencyCode(value: string): CurrencyCode {
  const normalized = value.trim().toUpperCase();
  if (!isCurrencyCode(normalized)) {
    throw new UnsupportedCurrencyError(normalized);
  }

  return normalized;
}

export function getCurrencyExponent(currency: CurrencyCode | string): number {
  const normalized = currency.trim().toUpperCase();
  if (!isCurrencyCode(normalized)) {
    throw new UnsupportedCurrencyError(normalized);
  }

  return CURRENCY_MINOR_UNITS[normalized];
}

export function listSupportedCurrencies(): readonly string[] {
  return Object.keys(CURRENCY_MINOR_UNITS).sort();
}
