import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeBudgetCategoryScope, type BudgetCategoryOption } from "@/modules/plans/ui/components/budget-category-scope-field";

const root: BudgetCategoryOption = { id: "food", name: "Food", kind: "EXPENSE", systemKey: "FOOD", parentCategoryId: null };
const otherRoot: BudgetCategoryOption = { id: "travel", name: "Travel", kind: "EXPENSE", systemKey: "TRAVEL", parentCategoryId: null };
const restaurant: BudgetCategoryOption = { id: "restaurants", name: "Restaurants", kind: "EXPENSE", systemKey: null, parentCategoryId: "food" };
const groceries: BudgetCategoryOption = { id: "groceries", name: "Groceries", kind: "EXPENSE", systemKey: null, parentCategoryId: "food" };

test("budget category scope retains only canonical roots and active direct children", () => {
  assert.deepEqual(sanitizeBudgetCategoryScope({ mode: "SUBCATEGORIES", categoryId: "food", subcategoryIds: ["restaurants", "removed", "restaurants"] }, [root, otherRoot], [restaurant, groceries]), { mode: "SUBCATEGORIES", categoryId: "food", subcategoryIds: ["restaurants"] });
  assert.equal(sanitizeBudgetCategoryScope({ mode: "CATEGORY", categoryId: "missing", subcategoryIds: [] }, [root], []), null);
});

test("changing parent or removing all children safely returns explicit entire-category scope", () => {
  assert.deepEqual(sanitizeBudgetCategoryScope({ mode: "SUBCATEGORIES", categoryId: "travel", subcategoryIds: ["restaurants"] }, [root, otherRoot], []), { mode: "CATEGORY", categoryId: "travel", subcategoryIds: [] });
  assert.deepEqual(sanitizeBudgetCategoryScope({ mode: "CATEGORY", categoryId: "food", subcategoryIds: [] }, [root], [restaurant]), { mode: "CATEGORY", categoryId: "food", subcategoryIds: [] });
});
