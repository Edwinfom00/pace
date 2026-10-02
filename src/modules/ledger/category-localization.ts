import {
  getDashboardLabels,
  type DashboardLabels,
  type DashboardMessageKey,
} from "@/i18n/dashboard-messages";

export type LocalizableCategory = {
  readonly name: string;
  readonly systemKey?: string | null;
};

export type CategoryLocalizer = {
  name(category: LocalizableCategory): string;
  category<T extends LocalizableCategory | null | undefined>(category: T): T;
  categories<T extends LocalizableCategory>(categories: readonly T[]): T[];
};

const toCamelCase = (segment: string) =>
  segment.replace(/-([a-z0-9])/g, (_, character: string) => character.toUpperCase());

export function systemCategoryMessageKey(
  labels: DashboardLabels,
  systemKey: string | null | undefined,
): DashboardMessageKey | null {
  if (!systemKey) return null;
  const key = `categories.system.${systemKey.split(":").map(toCamelCase).join(".")}`;
  return key in labels ? (key as DashboardMessageKey) : null;
}

export function localizeCategoryName(labels: DashboardLabels, category: LocalizableCategory): string {
  const key = systemCategoryMessageKey(labels, category.systemKey);
  return key ? labels[key] : category.name;
}

export function localizeCategory<T extends LocalizableCategory | null | undefined>(
  labels: DashboardLabels,
  category: T,
): T {
  if (!category) return category;
  const name = localizeCategoryName(labels, category);
  return name === category.name ? category : { ...category, name };
}

export function localizeCategories<T extends LocalizableCategory>(
  labels: DashboardLabels,
  categories: readonly T[],
): T[] {
  return categories.map((category) => localizeCategory(labels, category));
}

export function createCategoryLocalizer(language: string | null | undefined): CategoryLocalizer {
  const labels = getDashboardLabels(language);
  return {
    name: (category) => localizeCategoryName(labels, category),
    category: (category) => localizeCategory(labels, category),
    categories: (categories) => localizeCategories(labels, categories),
  };
}
