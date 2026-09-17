import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

/**
 * Isolated, UI-only presentation data for the manual-transaction preview.
 * These entries are not persisted workspace categories and must not power
 * production queries; ledger-backed categories will replace them.
 */
export const expenseTransactionCategoryFixtures = [
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

export const incomeTransactionCategoryFixtures = [
  {
    id: "salary",
    iconKey: "salary",
    labels: { en: "Salary", fr: "Salaire", de: "Gehalt" },
  },
  {
    id: "freelance-income",
    iconKey: "freelance-income",
    labels: { en: "Freelance income", fr: "Revenu indépendant", de: "Freiberufliche Einnahmen" },
  },
  {
    id: "business-income",
    iconKey: "business-income",
    labels: { en: "Business income", fr: "Revenu d’entreprise", de: "Geschäftseinnahmen" },
  },
  {
    id: "gift-income",
    iconKey: "gift-income",
    labels: { en: "Gift income", fr: "Don", de: "Geschenk" },
  },
  {
    id: "investment-income",
    iconKey: "investment-income",
    labels: { en: "Investment income", fr: "Revenu d’investissement", de: "Anlageerträge" },
  },
  {
    id: "cashback",
    iconKey: "cashback",
    labels: { en: "Cashback", fr: "Remise en argent", de: "Cashback" },
  },
  {
    id: "other-income",
    iconKey: "generic-income",
    labels: { en: "Other income", fr: "Autre revenu", de: "Sonstige Einnahmen" },
  },
] as const satisfies readonly {
  readonly id: string;
  readonly iconKey: TransactionIconKey;
  readonly labels: Readonly<Record<OnboardingLanguage, string>>;
}[];

export type TransactionCategoryFixtureKind = "EXPENSE" | "INCOME";
export type ExpenseTransactionCategoryFixtureId = (typeof expenseTransactionCategoryFixtures)[number]["id"];
export type IncomeTransactionCategoryFixtureId = (typeof incomeTransactionCategoryFixtures)[number]["id"];
export type TransactionCategoryFixtureId = ExpenseTransactionCategoryFixtureId | IncomeTransactionCategoryFixtureId;
export type TransactionCategoryFixtureIdByKind = {
  readonly EXPENSE: ExpenseTransactionCategoryFixtureId;
  readonly INCOME: IncomeTransactionCategoryFixtureId;
};

type TransactionCategoryFixtureForKind<K extends TransactionCategoryFixtureKind> =
  K extends "EXPENSE"
    ? (typeof expenseTransactionCategoryFixtures)[number]
    : (typeof incomeTransactionCategoryFixtures)[number];

type TransactionCategoryFixture = (typeof expenseTransactionCategoryFixtures)[number] | (typeof incomeTransactionCategoryFixtures)[number];
type LocalizedTransactionCategoryFixture<T extends TransactionCategoryFixture> = T & { readonly label: string };

function localizeCategoryFixtures<T extends TransactionCategoryFixture>(fixtures: readonly T[], language: OnboardingLanguage) {
  return fixtures.map((category) => ({
    ...category,
    label: category.labels[language],
  }));
}

export function getTransactionCategoryFixtures<K extends TransactionCategoryFixtureKind>(
  kind: K,
  language: OnboardingLanguage,
): readonly LocalizedTransactionCategoryFixture<TransactionCategoryFixtureForKind<K>>[];
export function getTransactionCategoryFixtures(
  kind: TransactionCategoryFixtureKind,
  language: OnboardingLanguage,
): readonly LocalizedTransactionCategoryFixture<TransactionCategoryFixture>[] {
  return kind === "EXPENSE"
    ? localizeCategoryFixtures(expenseTransactionCategoryFixtures, language)
    : localizeCategoryFixtures(incomeTransactionCategoryFixtures, language);
}
