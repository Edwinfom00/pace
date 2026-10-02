import type {
  CurrencyForecast,
  ForecastHorizonDays,
} from "./forecast";

export type ForecastCumulativeFlow = {
  readonly inflowMinor: string;
  readonly outflowMinor: string;
};

export function cumulativeForecastFlows(
  currency: CurrencyForecast,
): readonly ForecastCumulativeFlow[] {
  let inflow = 0n;
  let outflow = 0n;
  return currency.points.map((point) => {
    inflow += BigInt(point.projectedInflows.nominalMinor);
    outflow += BigInt(point.projectedOutflows.nominalMinor);
    return { inflowMinor: inflow.toString(), outflowMinor: outflow.toString() };
  });
}

export function defaultForecastInspectionIndex(currency: CurrencyForecast): number {
  const index = currency.points.findIndex((point) => point.events.length > 0);
  return index === -1 ? 0 : index;
}

export type ForecastCadence =
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "CUSTOM";

export function forecastCadence(cadenceDays: number): ForecastCadence {
  if (cadenceDays === 7) return "WEEKLY";
  if (cadenceDays === 14) return "BIWEEKLY";
  if (cadenceDays >= 28 && cadenceDays <= 31) return "MONTHLY";
  if (cadenceDays >= 89 && cadenceDays <= 92) return "QUARTERLY";
  if (cadenceDays >= 365 && cadenceDays <= 366) return "YEARLY";
  return "CUSTOM";
}

export type ForecastInsight =
  | {
    readonly kind: "TREND";
    readonly direction: "UP" | "DOWN" | "FLAT";
    readonly deltaMinor: string;
  }
  | {
    readonly kind: "HEAVY_MONTH";

    readonly month: string;
    readonly count: number;
    readonly totalMinor: string;
  }
  | {
    readonly kind: "STABILITY";

    readonly firstNegativeDate: string | null;
  };

export function forecastInsights(currency: CurrencyForecast): readonly ForecastInsight[] {
  const end = currency.points.at(-1);
  if (!end) return [];
  const delta =
    BigInt(end.projectedClosingBalance.nominalMinor) -
    BigInt(currency.openingBalance.nominalMinor);
  const insights: ForecastInsight[] = [
    {
      kind: "TREND",
      direction: delta > 0n ? "UP" : delta < 0n ? "DOWN" : "FLAT",
      deltaMinor: (delta < 0n ? -delta : delta).toString(),
    },
  ];

  const months = new Map<string, { count: number; total: bigint }>();
  for (const point of currency.points) {
    const month = point.date.slice(0, 7);
    const entry = months.get(month) ?? { count: 0, total: 0n };
    for (const event of point.events) {
      if (event.direction !== "OUTFLOW") continue;
      entry.count += 1;
      entry.total += BigInt(event.amount.nominalMinor);
    }
    months.set(month, entry);
  }
  if (months.size > 1) {
    let heaviest: [string, { count: number; total: bigint }] | null = null;
    for (const entry of months) {
      if (entry[1].count && (!heaviest || entry[1].total > heaviest[1].total))
        heaviest = entry;
    }
    if (heaviest)
      insights.push({
        kind: "HEAVY_MONTH",
        month: heaviest[0],
        count: heaviest[1].count,
        totalMinor: heaviest[1].total.toString(),
      });
  }

  insights.push({
    kind: "STABILITY",
    firstNegativeDate:
      currency.points.find(
        (point) => BigInt(point.projectedClosingBalance.minimumMinor) < 0n,
      )?.date ?? null,
  });
  return insights;
}


export function forecastAxisTickIndexes(
  dates: readonly string[],
  horizonDays: ForecastHorizonDays,
): ReadonlySet<number> {
  const anchorDays =
    horizonDays <= 30 ? [1, 8, 15, 22] : horizonDays <= 90 ? [1, 15] : [1];
  const minimumGap = Math.max(3, Math.round(dates.length / 14));
  const last = dates.length - 1;
  const indexes = new Set<number>(dates.length ? [0] : []);
  let previous = 0;
  dates.forEach((date, index) => {
    if (index === 0 || index === last) return;
    if (!anchorDays.includes(Number(date.slice(8, 10)))) return;
    if (index - previous < minimumGap || last - index < minimumGap) return;
    indexes.add(index);
    previous = index;
  });
  if (last > 0) indexes.add(last);
  return indexes;
}
