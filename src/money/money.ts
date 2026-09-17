import { getCurrencyExponent, toCurrencyCode, type CurrencyCode } from "./currency";

export interface Money {
  readonly currency: CurrencyCode;
  readonly minor: bigint;
}

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;


export function parseDecimalMoney(value: string, currency: CurrencyCode | string): Money | null {
  const normalized = value.normalize("NFKC").trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return null;

  const resolvedCurrency = toCurrencyCode(currency);
  const exponent = getCurrencyExponent(resolvedCurrency);
  const whole = BigInt(match[2] ?? "0");
  const fraction = match[3] ?? "";

  // Extra decimal digits are valid only when they do not imply rounding.
  if (fraction.length > exponent && /[1-9]/.test(fraction.slice(exponent))) return null;

  const fractionMinor = BigInt((fraction + "0".repeat(exponent)).slice(0, exponent) || "0");
  const minor = whole * 10n ** BigInt(exponent) + fractionMinor;
  if (minor > MAX_POSTGRES_BIGINT) return null;

  return money(resolvedCurrency, match[1] === "-" ? -minor : minor);
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, received: string) {
    super(`Cannot aggregate ${received} with ${expected} without an explicit conversion strategy.`);
    this.name = "CurrencyMismatchError";
  }
}

export interface CurrencyConversionStrategy {
  convert(money: Money, targetCurrency: CurrencyCode): Money;
}

export function money(currency: CurrencyCode | string, minor: bigint): Money {
  return { currency: toCurrencyCode(currency), minor };
}

export function zero(currency: CurrencyCode | string): Money {
  return money(currency, 0n);
}

export function add(left: Money, right: Money): Money {
  assertSameCurrency(left.currency, right.currency);
  return { currency: left.currency, minor: left.minor + right.minor };
}

export function subtract(left: Money, right: Money): Money {
  assertSameCurrency(left.currency, right.currency);
  return { currency: left.currency, minor: left.minor - right.minor };
}

export function negate(value: Money): Money {
  return { currency: value.currency, minor: -value.minor };
}

export function sum(
  values: readonly Money[],
  options: { currency?: CurrencyCode | string; conversion?: CurrencyConversionStrategy } = {},
): Money {
  const targetCurrency = options.currency ? toCurrencyCode(options.currency) : values[0]?.currency;

  if (!targetCurrency) {
    throw new Error("A target currency is required to aggregate an empty money collection.");
  }

  return values.reduce<Money>((total, value) => {
    if (value.currency === targetCurrency) {
      return { currency: targetCurrency, minor: total.minor + value.minor };
    }

    if (!options.conversion) {
      throw new CurrencyMismatchError(targetCurrency, value.currency);
    }

    const converted = options.conversion.convert(value, targetCurrency);
    assertSameCurrency(targetCurrency, converted.currency);
    return { currency: targetCurrency, minor: total.minor + converted.minor };
  }, zero(targetCurrency));
}

export function toDecimalString(value: Money): string {
  const exponent = getCurrencyExponent(value.currency);
  const sign = value.minor < 0n ? "-" : "";
  const absolute = (value.minor < 0n ? -value.minor : value.minor).toString();

  if (exponent === 0) {
    return `${sign}${absolute}`;
  }

  const padded = absolute.padStart(exponent + 1, "0");
  return `${sign}${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
}

function assertSameCurrency(expected: CurrencyCode, received: CurrencyCode): void {
  if (expected !== received) {
    throw new CurrencyMismatchError(expected, received);
  }
}
