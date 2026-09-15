import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

/**
 * Temporary presentation data for M8.5C.3. These entries are intentionally
 * not persisted workspace categories and will be replaced by ledger data.
 */
export const transactionCategoryFixtures = [
  {
    id: "other-expense",
    iconKey: "generic-expense",
    labels: { en: "Other expense", fr: "Autre dépense", de: "Sonstige Ausgaben" },
  },
  {
    id: "groceries",
    iconKey: "supermarket",
    labels: { en: "Groceries", fr: "Courses", de: "Lebensmittel" },
  },
  {
    id: "dining",
    iconKey: "restaurant",
    labels: { en: "Dining", fr: "Restaurants", de: "Essen gehen" },
  },
  {
    id: "transport",
    iconKey: "public-transport",
    labels: { en: "Transport", fr: "Transport", de: "Transport" },
  },
  {
    id: "shopping",
    iconKey: "online-shopping",
    labels: { en: "Shopping", fr: "Achats", de: "Einkäufe" },
  },
  {
    id: "subscriptions",
    iconKey: "subscription",
    labels: { en: "Subscriptions", fr: "Abonnements", de: "Abonnements" },
  },
  {
    id: "utilities",
    iconKey: "electricity",
    labels: { en: "Utilities", fr: "Factures", de: "Nebenkosten" },
  },
  {
    id: "health",
    iconKey: "doctor",
    labels: { en: "Health", fr: "Santé", de: "Gesundheit" },
  },
] as const satisfies readonly {
  readonly id: string;
  readonly iconKey: TransactionIconKey;
  readonly labels: Readonly<Record<OnboardingLanguage, string>>;
}[];

export type TransactionCategoryFixtureId = (typeof transactionCategoryFixtures)[number]["id"];

export function getTransactionCategoryFixtures(language: OnboardingLanguage) {
  return transactionCategoryFixtures.map((category) => ({
    ...category,
    label: category.labels[language],
  }));
}
