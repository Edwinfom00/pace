import assert from "node:assert/strict";
import test from "node:test";

import { toLedgerCategoryHierarchy } from "@/modules/ledger/domain";
import { createLedgerCategorySchema } from "@/modules/ledger/validation";

const category = (id: string, parentCategoryId: string | null, kind: "EXPENSE" | "INCOME" = "EXPENSE") => ({
  id, parentCategoryId, workspaceId: "workspace-1", name: id, kind, isSystem: false, systemKey: null, createdByUserId: "user-1", createdAt: new Date(), updatedAt: new Date(),
});

test("category hierarchy returns roots and direct children without a separate entity", () => {
  const hierarchy = toLedgerCategoryHierarchy([category("food", null), category("restaurants", "food"), category("income", null, "INCOME")]);
  assert.deepEqual(hierarchy.roots.map((item) => item.id), ["food", "income"]);
  assert.deepEqual(hierarchy.childrenByParentId.get("food")?.map((item) => item.id), ["restaurants"]);
});

test("category creation accepts an optional canonical parent ID and keeps existing roots null", () => {
  assert.equal(createLedgerCategorySchema.parse({ name: "Food", kind: "EXPENSE" }).parentCategoryId, null);
  assert.equal(createLedgerCategorySchema.parse({ name: "Restaurants", kind: "EXPENSE", parentCategoryId: "00000000-0000-4000-8000-000000000001" }).parentCategoryId, "00000000-0000-4000-8000-000000000001");
});
