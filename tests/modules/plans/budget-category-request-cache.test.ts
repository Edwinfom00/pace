import assert from "node:assert/strict";
import test from "node:test";

import { BudgetCategoryRequestCache } from "@/modules/plans/ui/components/budget-category-request-cache";

test("category request cache reuses fulfilled values and deduplicates concurrent reads", async () => {
  const cache = new BudgetCategoryRequestCache<string>();
  let calls = 0;
  let resolveRequest: ((value: readonly string[]) => void) | undefined;
  const loader = () => {
    calls += 1;
    return new Promise<readonly string[]>((resolve) => {
      resolveRequest = resolve;
    });
  };

  const first = cache.load("workspace-1:food", loader);
  const second = cache.load("workspace-1:food", loader);
  assert.equal(calls, 1);
  resolveRequest?.(["restaurants"]);
  assert.deepEqual(await first, ["restaurants"]);
  assert.deepEqual(await second, ["restaurants"]);
  assert.deepEqual(await cache.load("workspace-1:food", loader), ["restaurants"]);
  assert.equal(calls, 1);
});

test("category request cache keeps workspace scopes isolated", async () => {
  const cache = new BudgetCategoryRequestCache<string>();
  await cache.load("workspace-1:food", async () => ["restaurants"]);
  assert.equal(cache.get("workspace-2:food"), undefined);
});
