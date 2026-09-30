"use client";

import { PaceMoneyInput } from "@/components/pace/forms/pace-money-input";
import { getCurrencyExponent } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";

export function parseBudgetAmount(value: string, currency: string) {
  const compact = value
    .normalize("NFKC")
    .trim()
    .replaceAll(/[\s\u00a0\u202f]/g, "");
  const exponent = getCurrencyExponent(currency);
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    return parseDecimalMoney(
      compact.replaceAll(decimal === "," ? "." : ",", "").replace(decimal, "."),
      currency,
    );
  }
  const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (!separator) return parseDecimalMoney(compact, currency);
  const fractionLength = compact.length - compact.lastIndexOf(separator) - 1;
  return parseDecimalMoney(
    exponent > 0 && fractionLength > 0 && fractionLength <= exponent
      ? compact.replace(separator, ".")
      : compact.replaceAll(separator, ""),
    currency,
  );
}

export function BudgetAmountField({
  currency,
  error,
  helperText,
  label,
  onChange,
  value,
}: {
  readonly currency: string;
  readonly error?: string;
  readonly helperText: string;
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <PaceMoneyInput
      currency={currency}
      error={error}
      helperText={helperText}
      label={label}
      onValueChange={onChange}
      size="compact"
      value={value}
    />
  );
}
