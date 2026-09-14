import type { LedgerTransactionRecord } from "@/modules/ledger/domain";

export const RECURRING_AMOUNT_TOLERANCE_BPS = 500;
const MIN_CADENCE_DAYS = 7;
const MAX_CADENCE_DAYS = 400;

export interface RecurringTransactionSample {
  transaction: LedgerTransactionRecord;
  normalizedMerchant: string;
}

export interface RecurringCandidate {
  detectionKey: string;
  normalizedMerchant: string;
  accountId: string | null;
  categoryId: string | null;
  currency: string;
  typicalAmountMinor: bigint;
  amountToleranceBps: number;
  cadenceDays: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  sampleTransactionIds: string[];
}

/**
 * Finds recurring-payment candidates without a model. A candidate needs at
 * least three posted expense transactions for the same normalized merchant,
 * account and currency; their amounts and date intervals must both be close.
 */
export function detectRecurringCandidates(
  samples: readonly RecurringTransactionSample[],
): RecurringCandidate[] {
  const groups = new Map<string, RecurringTransactionSample[]>();
  for (const sample of samples) {
    const transaction = sample.transaction;
    if (
      transaction.kind !== "EXPENSE" ||
      transaction.status !== "POSTED" ||
      !sample.normalizedMerchant
    ) {
      continue;
    }
    const key = [sample.normalizedMerchant, transaction.accountId ?? "none", transaction.currency].join("|");
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => detectGroup(group))
    .filter((candidate): candidate is RecurringCandidate => candidate !== null);
}

function detectGroup(group: readonly RecurringTransactionSample[]): RecurringCandidate | null {
  if (group.length < 3) return null;
  const ordered = [...group].sort(
    (left, right) => left.transaction.occurredAt.getTime() - right.transaction.occurredAt.getTime(),
  );
  const amounts = ordered.map((sample) => sample.transaction.amountMinor);
  const typicalAmountMinor = medianBigInt(amounts);
  if (!amounts.every((amount) => withinAmountTolerance(amount, typicalAmountMinor))) return null;

  const intervals = ordered.slice(1).map((sample, index) =>
    wholeDaysBetween(ordered[index]!.transaction.occurredAt, sample.transaction.occurredAt),
  );
  const cadenceDays = medianNumber(intervals);
  if (cadenceDays < MIN_CADENCE_DAYS || cadenceDays > MAX_CADENCE_DAYS) return null;
  const cadenceToleranceDays = Math.max(3, Math.round(cadenceDays * 0.2));
  if (!intervals.every((interval) => Math.abs(interval - cadenceDays) <= cadenceToleranceDays)) return null;

  const first = ordered[0]!.transaction;
  const last = ordered.at(-1)!.transaction;
  const normalizedMerchant = ordered[0]!.normalizedMerchant;
  return {
    detectionKey: [normalizedMerchant, first.accountId ?? "none", first.currency].join("|"),
    normalizedMerchant,
    accountId: first.accountId,
    categoryId: first.categoryId,
    currency: first.currency,
    typicalAmountMinor,
    amountToleranceBps: RECURRING_AMOUNT_TOLERANCE_BPS,
    cadenceDays,
    firstOccurredAt: first.occurredAt,
    lastOccurredAt: last.occurredAt,
    sampleTransactionIds: ordered.map((sample) => sample.transaction.id),
  };
}

export function withinAmountTolerance(
  amount: bigint,
  expected: bigint,
  toleranceBps = RECURRING_AMOUNT_TOLERANCE_BPS,
): boolean {
  if (expected <= 0n) return false;
  return abs(amount - expected) * 10_000n <= expected * BigInt(toleranceBps);
}

function wholeDaysBetween(left: Date, right: Date): number {
  return Math.round((right.getTime() - left.getTime()) / 86_400_000);
}

function medianNumber(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function medianBigInt(values: readonly bigint[]): bigint {
  const ordered = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return ordered[Math.floor(ordered.length / 2)] ?? 0n;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}
