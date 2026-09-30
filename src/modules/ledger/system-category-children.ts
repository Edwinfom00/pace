import type { LedgerCategoryKind } from "./domain";

export type SystemCategoryRecord = {
  readonly id: string;
  readonly parentCategoryId: string | null;
  readonly name: string;
  readonly kind: LedgerCategoryKind;
  readonly isSystem: boolean;
  readonly systemKey: string | null;
};

export type SystemCategoryChild = SystemCategoryRecord & {
  readonly rootSystemKey: string;
};

const id = (suffix: number) =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

const child = (
  suffix: number,
  rootSystemKey: string,
  name: string,
  key: string,
): SystemCategoryChild => ({
  id: id(suffix),
  parentCategoryId: null,
  name,
  kind: "EXPENSE",
  isSystem: true,
  systemKey: key,
  rootSystemKey,
});

/**
 * V1's canonical system taxonomy. A child is only materialized when its
 * existing root is present, so this is safe for installations with a smaller
 * catalog.
 */
export const SYSTEM_CATEGORY_CHILDREN = [
  child(301, "expense:dining", "Restaurants", "expense:dining:restaurants"),
  child(302, "expense:dining", "Cafés", "expense:dining:cafes"),
  child(303, "expense:dining", "Delivery", "expense:dining:delivery"),
  child(304, "expense:transport", "Fuel", "expense:transport:fuel"),
  child(
    305,
    "expense:transport",
    "Taxi / ride-hailing",
    "expense:transport:ride-hailing",
  ),
  child(
    306,
    "expense:transport",
    "Public transport",
    "expense:transport:public-transport",
  ),
  child(307, "expense:transport", "Parking", "expense:transport:parking"),
  child(
    308,
    "expense:transport",
    "Vehicle maintenance",
    "expense:transport:vehicle-maintenance",
  ),
  child(309, "expense:housing", "Rent", "expense:housing:rent"),
  child(310, "expense:housing", "Maintenance", "expense:housing:maintenance"),
  child(
    311,
    "expense:utilities",
    "Electricity",
    "expense:utilities:electricity",
  ),
  child(312, "expense:utilities", "Water", "expense:utilities:water"),
  child(313, "expense:utilities", "Internet", "expense:utilities:internet"),
  child(314, "expense:utilities", "Mobile", "expense:utilities:mobile"),
  child(315, "expense:health", "Pharmacy", "expense:health:pharmacy"),
  child(316, "expense:health", "Doctor", "expense:health:doctor"),
  child(317, "expense:health", "Hospital", "expense:health:hospital"),
  child(318, "expense:health", "Insurance", "expense:health:insurance"),
  child(319, "expense:shopping", "Clothing", "expense:shopping:clothing"),
  child(320, "expense:shopping", "Electronics", "expense:shopping:electronics"),
  child(321, "expense:shopping", "Household", "expense:shopping:household"),
  child(
    322,
    "expense:shopping",
    "Personal purchases",
    "expense:shopping:personal-purchases",
  ),
  child(
    323,
    "expense:entertainment",
    "Streaming",
    "expense:entertainment:streaming",
  ),
  child(324, "expense:entertainment", "Games", "expense:entertainment:games"),
  child(325, "expense:entertainment", "Events", "expense:entertainment:events"),
  child(
    326,
    "expense:entertainment",
    "Leisure",
    "expense:entertainment:leisure",
  ),
] as const;

export type SystemCategoryChildStore = {
  listSystemCategories(): Promise<readonly SystemCategoryRecord[]>;
  insertSystemChildren(
    children: readonly SystemCategoryRecord[],
  ): Promise<void>;
};

export type SystemCategoryBackfillResult = {
  readonly roots: readonly SystemCategoryRecord[];
  readonly inserted: readonly SystemCategoryRecord[];
  readonly existing: readonly SystemCategoryRecord[];
};

export async function backfillSystemCategoryChildren(
  store: SystemCategoryChildStore,
): Promise<SystemCategoryBackfillResult> {
  const categories = await store.listSystemCategories();
  const rootsByKey = new Map(
    categories
      .filter((category) => category.isSystem && !category.parentCategoryId)
      .map((category) => [category.systemKey, category] as const),
  );
  const categoriesByKey = new Map(
    categories.map((category) => [category.systemKey, category] as const),
  );
  const roots = [...rootsByKey.values()].filter(
    (root): root is SystemCategoryRecord => root.systemKey !== null,
  );
  const inserted: SystemCategoryRecord[] = [];
  const existing: SystemCategoryRecord[] = [];

  for (const definition of SYSTEM_CATEGORY_CHILDREN) {
    const root = rootsByKey.get(definition.rootSystemKey);
    if (!root || root.kind !== definition.kind || !root.isSystem) continue;

    const matching = categoriesByKey.get(definition.systemKey);
    if (matching) {
      if (
        matching.parentCategoryId !== root.id ||
        matching.kind !== root.kind
      ) {
        throw new Error(
          `System category ${definition.systemKey} exists with an incompatible parent or kind.`,
        );
      }
      existing.push(matching);
      continue;
    }

    inserted.push({
      id: definition.id,
      parentCategoryId: root.id,
      name: definition.name,
      kind: definition.kind,
      isSystem: definition.isSystem,
      systemKey: definition.systemKey,
    });
  }

  if (inserted.length) await store.insertSystemChildren(inserted);
  return { roots, inserted, existing };
}
