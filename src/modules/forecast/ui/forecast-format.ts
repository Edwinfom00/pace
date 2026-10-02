import type {
  ForecastHorizonDays,
  ForecastRecurringItem,
} from "@/modules/forecast/domain/forecast";
import { forecastCadence } from "@/modules/forecast/domain/forecast-presentation";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

export type ForecastLabels = Readonly<Record<string, string>>;

export function fillLabel(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function formatForecastLongDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`));
}

export function formatForecastMonth(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));
}

export function formatSignedMoney(
  minor: bigint | string,
  currency: string,
  locale: string,
  sign: "+" | "-",
): string {
  const value = typeof minor === "bigint" ? minor : BigInt(minor);
  const absolute = value < 0n ? -value : value;
  return `${sign} ${formatOverviewMoney(absolute, currency, locale)}`;
}

export function formatBalanceDelta(
  minor: bigint,
  currency: string,
  locale: string,
): string {
  if (minor === 0n) return formatOverviewMoney(0n, currency, locale);
  return formatSignedMoney(minor, currency, locale, minor > 0n ? "+" : "-");
}

export function horizonLabel(
  labels: ForecastLabels,
  horizon: ForecastHorizonDays,
): string {
  return labels[`horizon${horizon}`] ?? String(horizon);
}

export function cadenceLabel(labels: ForecastLabels, cadenceDays: number): string {
  switch (forecastCadence(cadenceDays)) {
    case "WEEKLY":
      return labels.cadenceWeekly;
    case "BIWEEKLY":
      return labels.cadenceBiweekly;
    case "MONTHLY":
      return labels.cadenceMonthly;
    case "QUARTERLY":
      return labels.cadenceQuarterly;
    case "YEARLY":
      return labels.cadenceYearly;
    default:
      return fillLabel(labels.cadenceCustom, { days: cadenceDays });
  }
}

export function recurringItemName(
  labels: ForecastLabels,
  item: ForecastRecurringItem | undefined,
  direction: "INFLOW" | "OUTFLOW",
): string {
  return (
    item?.name ??
    (direction === "INFLOW" ? labels.unnamedIncome : labels.unnamedExpense)
  );
}

export function countLabel(
  labels: ForecastLabels,
  count: number,
  one: string,
  other: string,
): string {
  return fillLabel(count === 1 ? labels[one] : labels[other], { count });
}
