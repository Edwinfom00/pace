import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { getRecurringReviewUiLabels } from "@/modules/recurring/ui/recurring-review-ui-labels";

test("review-action copy is complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getRecurringReviewUiLabels(getDashboardLabels(language));
    assert.ok(labels.actions.confirm.length > 0);
    assert.ok(labels.confirm.description.length > 0);
    assert.ok(labels.ignore.reason.length > 0);
    assert.ok(labels.restore.description.length > 0);
    assert.ok(labels.action.conflict.length > 0);
  }
});

test("review actions use policy capabilities, canonical PATCH mutations, and router reconciliation", async () => {
  const [component, overview, detail, route] = await Promise.all([
    readFile("src/modules/recurring/ui/components/recurring-review-actions.tsx", "utf8"),
    readFile("src/modules/recurring/ui/views/recurring-overview-view.tsx", "utf8"),
    readFile("src/modules/recurring/ui/views/recurring-detail-view.tsx", "utf8"),
    readFile("src/app/api/workspaces/[workspaceId]/recurring/[recurringId]/route.ts", "utf8"),
  ]);

  assert.match(component, /canConfirm/);
  assert.match(component, /canIgnore/);
  assert.match(component, /canRestore/);
  assert.match(component, /ResponsiveDialog/);
  assert.match(component, /idempotencyKey/);
  assert.match(component, /CONCURRENT_MODIFICATION/);
  assert.match(component, /router\.refresh\(\)/);
  assert.doesNotMatch(component, /setStatus\(/);
  assert.match(overview, /<RecurringReviewActions/);
  assert.match(detail, /<RecurringReviewActions/);
  assert.match(route, /z\.literal\("CONFIRM"\)/);
  assert.match(route, /z\.literal\("IGNORE"\)/);
  assert.match(route, /z\.literal\("RESTORE"\)/);
  assert.match(route, /service\.restoreRecurring/);
});
