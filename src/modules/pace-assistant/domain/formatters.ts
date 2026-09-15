import { getCurrencyExponent } from "@/money/currency";

import type { SerializedMoney } from "../types/pace-assistant";

/** Formats exact serialized minor units without converting source-of-truth values to Number. */
export function formatAssistantMoney(value: SerializedMoney, locale: string): string {
  const minor = BigInt(value.minorUnits);
  const exponent = getCurrencyExponent(value.currency);
  const absolute = minor < 0n ? -minor : minor;
  const divisor = 10n ** BigInt(exponent);
  const integer = absolute / divisor;
  const fraction = exponent === 0 ? "" : (absolute % divisor).toString().padStart(exponent, "0");
  const numberParts = new Intl.NumberFormat(locale, { useGrouping: true }).formatToParts(integer);
  const currencyParts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).formatToParts(0);
  const formattedInteger = numberParts.map((part) => part.value).join("");
  let emittedInteger = false;
  const formatted = currencyParts.map((part) => {
    if (part.type === "integer") {
      if (emittedInteger) return "";
      emittedInteger = true;
      return formattedInteger;
    }
    if (part.type === "fraction") return fraction;
    if (part.type === "minusSign") return "";
    return part.value;
  }).join("");
  return minor < 0n ? `-${formatted}` : formatted;
}

export function formatAssistantDate(value: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone }).format(new Date(value));
}

export function formatBps(value: string): string {
  const basisPoints = BigInt(value);
  const whole = basisPoints / 100n;
  const fraction = (basisPoints < 0n ? -basisPoints : basisPoints) % 100n;
  return fraction === 0n ? `${whole}%` : `${whole}.${fraction.toString().padStart(2, "0").replace(/0+$/, "")}%`;
}
