export const recurringFrequencyOptions = [
  { cadenceDays: 7, key: "weekly" },
  { cadenceDays: 14, key: "biweekly" },
  { cadenceDays: 30, key: "monthly" },
  { cadenceDays: 90, key: "quarterly" },
  { cadenceDays: 365, key: "yearly" },
] as const;

export type RecurringFrequencyKey = (typeof recurringFrequencyOptions)[number]["key"];

export const RECURRING_FREQUENCY_KEYS = recurringFrequencyOptions.map((option) => option.key) as [
  RecurringFrequencyKey,
  ...RecurringFrequencyKey[],
];

export function cadenceDaysForFrequency(key: RecurringFrequencyKey): number {
  return recurringFrequencyOptions.find((option) => option.key === key)!.cadenceDays;
}

export function frequencyForCadenceDays(cadenceDays: number): RecurringFrequencyKey | null {
  return recurringFrequencyOptions.find((option) => option.cadenceDays === cadenceDays)?.key ?? null;
}
