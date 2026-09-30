import assert from "node:assert/strict";
import test from "node:test";

import {
  backfillSystemCategoryChildren,
  SYSTEM_CATEGORY_CHILDREN,
  type SystemCategoryRecord,
} from "@/modules/ledger/system-category-children";
import { toLedgerCategoryHierarchy } from "@/modules/ledger/domain";

const root = (id: string, systemKey: string): SystemCategoryRecord => ({
  id, parentCategoryId: null, name: systemKey, kind: "EXPENSE", isSystem: true, systemKey,
});

test("system category child backfill is idempotent and only extends compatible roots", async () => {
  const records: SystemCategoryRecord[] = [
    root("dining", "expense:dining"),
    root("transport", "expense:transport"),
    root("salary", "income:salary"),
  ];
  const originalRoots = records.map((category) => ({ ...category }));
  const store = {
    listSystemCategories: async () => records,
    insertSystemChildren: async (children: readonly SystemCategoryRecord[]) => {
      records.push(...children);
    },
  };

  const first = await backfillSystemCategoryChildren(store);
  const second = await backfillSystemCategoryChildren(store);
  const expected = SYSTEM_CATEGORY_CHILDREN.filter((child) =>
    ["expense:dining", "expense:transport"].includes(child.rootSystemKey),
  );

  assert.equal(first.inserted.length, expected.length);
  assert.equal(second.inserted.length, 0);
  assert.equal(second.existing.length, expected.length);
  assert.deepEqual(records.slice(0, originalRoots.length), originalRoots);
  assert.equal(new Set(records.map((category) => category.systemKey)).size, records.length);
  assert.ok(records.slice(originalRoots.length).every((child) => child.parentCategoryId === "dining" || child.parentCategoryId === "transport"));

  const hierarchy = toLedgerCategoryHierarchy(records.map((category) => ({
    ...category, workspaceId: null, createdByUserId: null, createdAt: new Date(), updatedAt: new Date(),
  })));
  assert.equal(hierarchy.childrenByParentId.get("dining")?.length, 3);
  assert.equal(hierarchy.childrenByParentId.get("transport")?.length, 5);
  assert.ok([...hierarchy.childrenByParentId.values()].flat().every((child) => child.parentCategoryId && !records.find((parent) => parent.id === child.parentCategoryId)?.parentCategoryId));
});
