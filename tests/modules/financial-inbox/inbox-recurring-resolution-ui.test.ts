import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Inbox recurring detail uses only the M10.6B bridge with local pending and reconciliation refresh", async () => {
  const [actions, detailView, route, labels] = await Promise.all([
    readFile("src/modules/financial-inbox/ui/components/inbox-recurring-resolution-actions.tsx", "utf8"),
    readFile("src/modules/financial-inbox/ui/views/inbox-item-detail-view.tsx", "utf8"),
    readFile("src/app/api/workspaces/[workspaceId]/inbox/[inboxItemId]/recurring/route.ts", "utf8"),
    readFile("src/modules/financial-inbox/ui/inbox-detail-labels.ts", "utf8"),
  ]);

  assert.match(actions, /\/inbox\/\$\{encodeURIComponent\(inboxItemId\)\}\/recurring/);
  assert.match(actions, /method: "POST"/);
  assert.match(actions, /expectedInboxUpdatedAt/);
  assert.match(actions, /router\.refresh\(\)/);
  assert.match(actions, /INBOX_ITEM_STALE/);
  assert.match(actions, /INBOX_REASON_ALREADY_RESOLVED/);
  assert.match(actions, /ResponsiveDialog/);
  assert.match(actions, /RecurringStatusBadge/);
  assert.match(actions, /formatOverviewMoney/);
  assert.match(actions, /flex flex-wrap gap-2/);
  assert.match(actions, /aria-live="polite"/);
  assert.doesNotMatch(actions, /FilterLoadingSurface/);
  assert.doesNotMatch(actions, /\/recurring\/\$\{encodeURIComponent\(recurring\.id\)\}/);
  assert.doesNotMatch(actions, /amountMinor|accountId|balance|transactionId:/);
  assert.match(detailView, /detail\.capabilities\.recurring/);
  assert.match(detailView, /InboxRecurringResolutionActions/);
  assert.match(labels, /recurring\.confirm\.title/);
  assert.match(labels, /recurring\.ignore\.title/);
  assert.match(route, /revalidatePath\("\/w\/\[workspaceSlug\]\/inbox"/);
  assert.match(route, /revalidatePath\("\/w\/\[workspaceSlug\]\/overview"/);
});
