import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import {
  createCategoryLocalizer,
  localizeCategoryName,
  systemCategoryMessageKey,
} from "@/modules/ledger/category-localization";
import { SYSTEM_CATEGORY_CHILDREN } from "@/modules/ledger/system-category-children";

const SYSTEM_ROOT_KEYS = [
  "expense:groceries",
  "expense:dining",
  "expense:transport",
  "expense:housing",
  "expense:utilities",
  "expense:health",
  "expense:shopping",
  "expense:entertainment",
  "expense:other",
  "income:salary",
  "income:freelance",
  "income:gift",
  "income:other",
];

test("every seeded system category resolves to a translation in every dashboard language", () => {
  const systemKeys = [...SYSTEM_ROOT_KEYS, ...SYSTEM_CATEGORY_CHILDREN.map((category) => category.systemKey)];
  for (const language of ["en", "fr", "de"]) {
    const labels = getDashboardLabels(language);
    for (const systemKey of systemKeys) {
      assert.ok(systemCategoryMessageKey(labels, systemKey), `${language} is missing ${systemKey}`);
    }
  }
});

test("system categories are translated to the requested language", () => {
  const french = getDashboardLabels("fr");
  assert.equal(localizeCategoryName(french, { name: "Other income", systemKey: "income:other" }), "Autre revenu");
  assert.equal(
    localizeCategoryName(getDashboardLabels("de"), { name: "Taxi / ride-hailing", systemKey: "expense:transport:ride-hailing" }),
    "Taxi / Fahrdienst",
  );
});

test("workspace categories and unknown system keys keep their stored name", () => {
  const french = getDashboardLabels("fr");
  assert.equal(localizeCategoryName(french, { name: "Pets", systemKey: null }), "Pets");
  assert.equal(localizeCategoryName(french, { name: "Legacy", systemKey: "expense:unknown" }), "Legacy");
});

test("the localizer preserves every other category field", () => {
  const localizer = createCategoryLocalizer("fr");
  const category = { id: "c1", name: "Other income", systemKey: "income:other", kind: "INCOME" as const };
  assert.deepEqual(localizer.category(category), { ...category, name: "Autre revenu" });
  assert.equal(localizer.category(null), null);
  assert.deepEqual(localizer.categories([category]).map((item) => item.name), ["Autre revenu"]);
});
