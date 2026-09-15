import { getCurrencyExponent } from "@/money";

/** Formats bigint minor units without routing financial truth through Number. */
export function formatOverviewMoney(minor: bigint | string, currency: string, locale: string): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const exponent = getCurrencyExponent(currency);
  const isNegative = value < 0n;
  const absolute = isNegative ? -value : value;
  const divisor = 10n ** BigInt(exponent);
  const integer = absolute / divisor;
  const fraction = exponent === 0 ? "" : (absolute % divisor).toString().padStart(exponent, "0");
  const numberParts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(integer);
  const currencyParts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).formatToParts(0);
  const groupedInteger = numberParts.map((part) => part.value).join("");
  let emittedInteger = false;

  const formatted = currencyParts.map((part) => {
    if (part.type === "integer") {
      if (emittedInteger) return "";
      emittedInteger = true;
      return groupedInteger;
    }
    if (part.type === "fraction") return fraction;
    if (part.type === "minusSign") return "";
    return part.value;
  }).join("");

  return isNegative ? `-${formatted}` : formatted;
}

/** Chart coordinates are presentation-only and never feed a financial calculation. */
export function minorToChartValue(minor: string, currency: string): number {
  return Number(BigInt(minor)) / 10 ** getCurrencyExponent(currency);
}

export function formatCompactOverviewAmount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatOverviewDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
