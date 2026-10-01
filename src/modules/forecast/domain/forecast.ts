import type {
  LedgerAccountBalance,
  LedgerAccountRecord,
} from "@/modules/ledger/domain";
import type { RecurringPaymentRecord } from "@/modules/financial-inbox/domain";
import { projectRecurringPaymentOccurrences } from "@/modules/overview/domain/overview-right-rail";
import {
  localDateForInstant,
  localDateKey,
  periodForLocalDates,
} from "@/money/period";

export const FORECAST_HORIZONS = [30, 60, 90] as const;
export type ForecastHorizonDays = (typeof FORECAST_HORIZONS)[number];

export type ForecastAmount = {
  readonly nominalMinor: string;
  readonly minimumMinor: string;
  readonly maximumMinor: string;
  readonly uncertainty: "FIXED" | "VARIABLE";
  readonly toleranceBps: number;
};

export type ForecastEvent = {
  readonly recurringId: string;
  readonly direction: "INFLOW" | "OUTFLOW";
  readonly occursAt: string;
  readonly amount: ForecastAmount;
};

export type ForecastPoint = {
  readonly date: string;
  readonly openingBalance: ForecastAmount;
  readonly projectedInflows: ForecastAmount;
  readonly projectedOutflows: ForecastAmount;
  readonly projectedClosingBalance: ForecastAmount;
  readonly events: readonly ForecastEvent[];
};

export type CurrencyForecast = {
  readonly currency: string;
  readonly openingBalance: ForecastAmount;
  readonly points: readonly ForecastPoint[];
  readonly events: readonly ForecastEvent[];
  readonly totalInflows: ForecastAmount;
  readonly totalOutflows: ForecastAmount;
};

export type ForecastAccountOption = {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
};

export type WorkspaceForecast = {
  readonly horizonDays: ForecastHorizonDays;
  readonly asOf: string;
  readonly timeZone: string;
  readonly currencies: readonly CurrencyForecast[];
  /** Account choices are emitted by the canonical forecast read, never inferred by the client. */
  readonly accounts: readonly ForecastAccountOption[];
  readonly selectedAccountId: string | null;
  readonly recurringItemCount: number;
  readonly hasNonNegativeBalances: boolean;
};

export type BuildWorkspaceForecastInput = {
  readonly balances: readonly LedgerAccountBalance[];
  readonly accounts: readonly LedgerAccountRecord[];
  readonly recurringPayments: readonly RecurringPaymentRecord[];
  readonly horizonDays: ForecastHorizonDays;
  readonly now: Date;
  readonly timeZone: string;
  readonly accountId?: string;
};

/**
 * A read-only cash projection. It uses the canonical balance aggregate and
 * recurrence engine; it deliberately has no ledger repository dependency.
 */
export function buildWorkspaceForecast(
  input: BuildWorkspaceForecastInput,
): WorkspaceForecast {
  const startDate = localDateForInstant(input.now, input.timeZone);
  const calendarDays = Array.from({ length: input.horizonDays }, (_, index) => {
    const date = new Date(
      Date.UTC(startDate.year, startDate.month - 1, startDate.day + index),
    );
    return localDateKey({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  });
  const end = periodForLocalDates(
    calendarDays.at(-1)!,
    nextCalendarDate(calendarDays.at(-1)!),
    input.timeZone,
  ).end;
  const accountOptions = input.accounts
    .filter((account) => !account.archivedAt)
    .map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
    }))
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  const selectedAccountId = accountOptions.some(
    (account) => account.id === input.accountId,
  )
    ? (input.accountId ?? null)
    : null;
  const scopedAccounts = selectedAccountId
    ? input.accounts.filter((account) => account.id === selectedAccountId)
    : input.accounts;
  const accountsById = new Map(
    scopedAccounts.map((account) => [account.id, account]),
  );
  const openingByCurrency = new Map<string, bigint>();
  for (const balance of input.balances) {
    if (selectedAccountId && balance.accountId !== selectedAccountId) continue;
    openingByCurrency.set(
      balance.currency,
      (openingByCurrency.get(balance.currency) ?? 0n) +
        balance.currentBalanceMinor,
    );
  }

  const eventsByCurrency = new Map<string, ForecastEvent[]>();
  for (const payment of input.recurringPayments) {
    if (selectedAccountId && payment.accountId !== selectedAccountId) continue;
    if (payment.status !== "CONFIRMED" || payment.lifecycle !== "ACTIVE")
      continue;
    // The current canonical recurring model has only income and expense; do not infer transfers.
    if (payment.direction !== "INCOME" && payment.direction !== "EXPENSE")
      continue;
    const account = payment.accountId
      ? accountsById.get(payment.accountId)
      : null;
    if (
      payment.accountId &&
      (!account || account.currency !== payment.currency)
    )
      continue;
    const dates = projectRecurringPaymentOccurrences(
      {
        lastOccurredAt: payment.lastOccurredAt.toISOString(),
        nextOccurrenceAt: payment.nextOccurrenceAt?.toISOString() ?? null,
        cadenceDays: payment.cadenceDays,
      },
      input.now,
      input.timeZone,
      Math.ceil(input.horizonDays / Math.max(payment.cadenceDays, 1)) + 1,
    )
      .map((value) => new Date(value))
      .filter((value) => value >= input.now && value < end);
    for (const occursAt of dates) {
      const event: ForecastEvent = {
        recurringId: payment.id,
        direction: payment.direction === "INCOME" ? "INFLOW" : "OUTFLOW",
        occursAt: occursAt.toISOString(),
        amount: recurringAmount(
          payment.typicalAmountMinor,
          payment.amountToleranceBps,
        ),
      };
      const events = eventsByCurrency.get(payment.currency) ?? [];
      events.push(event);
      eventsByCurrency.set(payment.currency, events);
    }
  }

  const currencies = [
    ...new Set([...openingByCurrency.keys(), ...eventsByCurrency.keys()]),
  ].sort();
  const builtCurrencies = currencies.map((currency) =>
    buildCurrencyForecast(
      currency,
      openingByCurrency.get(currency) ?? 0n,
      eventsByCurrency.get(currency) ?? [],
      calendarDays,
      input.timeZone,
    ),
  );
  return {
    horizonDays: input.horizonDays,
    asOf: input.now.toISOString(),
    timeZone: input.timeZone,
    currencies: builtCurrencies,
    accounts: accountOptions,
    selectedAccountId,
    recurringItemCount: new Set(
      builtCurrencies.flatMap((currency) =>
        currency.events.map((event) => event.recurringId),
      ),
    ).size,
    hasNonNegativeBalances: builtCurrencies.every((currency) =>
      currency.points.every(
        (point) => BigInt(point.projectedClosingBalance.minimumMinor) >= 0n,
      ),
    ),
  };
}

function buildCurrencyForecast(
  currency: string,
  opening: bigint,
  events: readonly ForecastEvent[],
  calendarDays: readonly string[],
  timeZone: string,
): CurrencyForecast {
  const sortedEvents = [...events].sort(
    (left, right) =>
      left.occursAt.localeCompare(right.occursAt) ||
      left.recurringId.localeCompare(right.recurringId),
  );
  let balance = fixedAmount(opening);
  const points = calendarDays.map((date) => {
    const dayEvents = sortedEvents.filter(
      (event) =>
        localDateKey(
          localDateForInstant(new Date(event.occursAt), timeZone),
        ) === date,
    );
    const inflows = combine(
      dayEvents
        .filter((event) => event.direction === "INFLOW")
        .map((event) => event.amount),
    );
    const outflows = combine(
      dayEvents
        .filter((event) => event.direction === "OUTFLOW")
        .map((event) => event.amount),
    );
    const openingBalance = balance;
    balance = subtract(add(balance, inflows), outflows);
    return {
      date,
      openingBalance,
      projectedInflows: inflows,
      projectedOutflows: outflows,
      projectedClosingBalance: balance,
      events: dayEvents,
    };
  });
  return {
    currency,
    openingBalance: fixedAmount(opening),
    points,
    events: sortedEvents,
    totalInflows: combine(
      sortedEvents
        .filter((event) => event.direction === "INFLOW")
        .map((event) => event.amount),
    ),
    totalOutflows: combine(
      sortedEvents
        .filter((event) => event.direction === "OUTFLOW")
        .map((event) => event.amount),
    ),
  };
}

function recurringAmount(
  nominal: bigint,
  toleranceBps: number,
): ForecastAmount {
  const tolerance = BigInt(
    Math.max(0, Math.min(10_000, Math.floor(toleranceBps))),
  );
  const spread = nominal * tolerance;
  return {
    nominalMinor: nominal.toString(),
    minimumMinor: ((nominal * 10_000n - spread) / 10_000n).toString(),
    maximumMinor: ((nominal * 10_000n + spread) / 10_000n).toString(),
    uncertainty: tolerance === 0n ? "FIXED" : "VARIABLE",
    toleranceBps: Number(tolerance),
  };
}

function fixedAmount(value: bigint): ForecastAmount {
  const amount = value.toString();
  return {
    nominalMinor: amount,
    minimumMinor: amount,
    maximumMinor: amount,
    uncertainty: "FIXED",
    toleranceBps: 0,
  };
}

function combine(amounts: readonly ForecastAmount[]): ForecastAmount {
  return amounts.reduce((total, amount) => add(total, amount), fixedAmount(0n));
}

function add(left: ForecastAmount, right: ForecastAmount): ForecastAmount {
  return amountFromParts(
    BigInt(left.nominalMinor) + BigInt(right.nominalMinor),
    BigInt(left.minimumMinor) + BigInt(right.minimumMinor),
    BigInt(left.maximumMinor) + BigInt(right.maximumMinor),
  );
}

function subtract(left: ForecastAmount, right: ForecastAmount): ForecastAmount {
  return amountFromParts(
    BigInt(left.nominalMinor) - BigInt(right.nominalMinor),
    BigInt(left.minimumMinor) - BigInt(right.maximumMinor),
    BigInt(left.maximumMinor) - BigInt(right.minimumMinor),
  );
}

function amountFromParts(
  nominal: bigint,
  minimum: bigint,
  maximum: bigint,
): ForecastAmount {
  return {
    nominalMinor: nominal.toString(),
    minimumMinor: minimum.toString(),
    maximumMinor: maximum.toString(),
    uncertainty: minimum === maximum ? "FIXED" : "VARIABLE",
    toleranceBps: 0,
  };
}

function nextCalendarDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return localDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}
