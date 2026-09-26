import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { InboxCategoryResolutionResult } from "@/modules/financial-inbox/financial-inbox-service";
import { presentInboxCategoryResolution } from "@/modules/financial-inbox/inbox-category-resolution-presenter";
import {
  canSaveInboxCategorySelection,
  createAcceptInboxCategorySuggestionRequest,
  createChooseInboxCategoryRequest,
  getInboxCategoryResolutionActionVisibility,
  isInboxCategoryResolutionResponse,
  mapInboxCategoryResolutionFailure,
} from "@/modules/financial-inbox/ui/inbox-category-resolution-flow";

const versions = {
  expectedInboxUpdatedAt: "2026-09-23T10:00:00.000Z",
  expectedTransactionUpdatedAt: "2026-09-23T09:59:00.000Z",
};

test("category action visibility follows canonical capabilities and requires a real suggestion", () => {
  assert.deepEqual(getInboxCategoryResolutionActionVisibility({
    canAcceptCategorySuggestion: true,
    canChooseCategory: true,
    hasSuggestion: true,
  }), { accept: true, choose: true });
  assert.deepEqual(getInboxCategoryResolutionActionVisibility({
    canAcceptCategorySuggestion: false,
    canChooseCategory: false,
    hasSuggestion: true,
  }), { accept: false, choose: false });
  assert.deepEqual(getInboxCategoryResolutionActionVisibility({
    canAcceptCategorySuggestion: true,
    canChooseCategory: true,
    hasSuggestion: false,
  }), { accept: false, choose: true });
});

test("accept suggestion request carries only canonical concurrency and suggestion metadata", () => {
  const request = createAcceptInboxCategorySuggestionRequest({
    ...versions,
    suggestionCategoryId: "00000000-0000-4000-8000-000000000101",
    suggestionUpdatedAt: "2026-09-23T09:58:00.000Z",
  }, "accept-key");

  assert.deepEqual(request, {
    action: "ACCEPT_SUGGESTION",
    expectedInboxUpdatedAt: versions.expectedInboxUpdatedAt,
    expectedTransactionUpdatedAt: versions.expectedTransactionUpdatedAt,
    expectedSuggestionCategoryId: "00000000-0000-4000-8000-000000000101",
    expectedSuggestionUpdatedAt: "2026-09-23T09:58:00.000Z",
    idempotencyKey: "accept-key",
  });
  for (const financialField of ["amount", "amountMinor", "accountId", "currency", "kind", "type", "balance"]) {
    assert.equal(financialField in request, false);
  }
});

test("choose category request prevents no-change saves and contains no financial patch", () => {
  assert.equal(canSaveInboxCategorySelection("", null), false);
  assert.equal(canSaveInboxCategorySelection("category-current", "category-current"), false);
  assert.equal(canSaveInboxCategorySelection("category-new", "category-current"), true);

  const request = createChooseInboxCategoryRequest({ ...versions, categoryId: "category-new" }, "choose-key");
  assert.deepEqual(request, {
    action: "CHOOSE_CATEGORY",
    categoryId: "category-new",
    expectedInboxUpdatedAt: versions.expectedInboxUpdatedAt,
    expectedTransactionUpdatedAt: versions.expectedTransactionUpdatedAt,
    idempotencyKey: "choose-key",
  });
  assert.equal("patch" in request, false);
  assert.equal("amountMinor" in request, false);
  assert.equal("accountId" in request, false);
  assert.equal("currency" in request, false);
  assert.equal("kind" in request, false);
});

test("typed category errors map to refresh, conflict, or field-level UX", () => {
  assert.deepEqual(mapInboxCategoryResolutionFailure("CATEGORY_SUGGESTION_STALE"), {
    error: "staleSuggestion",
    refresh: "automatic",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("CATEGORY_NOT_ALLOWED"), {
    error: "category",
    refresh: "none",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("INBOX_ITEM_STALE"), {
    error: "changedSinceOpen",
    refresh: "user",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("CONCURRENT_MODIFICATION"), {
    error: "changedSinceOpen",
    refresh: "user",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("INBOX_REASON_ALREADY_RESOLVED"), {
    error: "changedSinceOpen",
    refresh: "user",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("INBOX_ACTION_NOT_ALLOWED"), {
    error: "notAvailable",
    refresh: "automatic",
  });
  assert.deepEqual(mapInboxCategoryResolutionFailure("ACTION_ALREADY_PROCESSED"), {
    error: null,
    refresh: "automatic",
  });
});

test("mutation response presenter is JSON-safe and omits financial truth", () => {
  const updatedAt = new Date("2026-09-23T10:01:00.000Z");
  const result = {
    transaction: {
      id: "transaction-1",
      categoryId: "category-new",
      updatedAt,
      amountMinor: 24_850n,
      accountId: "account-1",
      currency: "XAF",
      kind: "EXPENSE",
    },
    item: { id: "inbox-1", status: "RESOLVED", updatedAt },
    resolvedInboxItemIds: ["inbox-1"],
    unresolvedReasons: [],
    replayed: false,
  } as unknown as InboxCategoryResolutionResult;

  const response = { result: presentInboxCategoryResolution(result) };
  assert.doesNotThrow(() => JSON.stringify(response));
  assert.equal(isInboxCategoryResolutionResponse(response), true);
  assert.equal("amountMinor" in response.result, false);
  assert.equal("accountId" in response.result, false);
  assert.equal("currency" in response.result, false);
  assert.equal("kind" in response.result, false);
});

test("Inbox detail category UI reuses canonical responsive and selector primitives", async () => {
  const [actions, detailView, detailPage, route] = await Promise.all([
    readFile("src/modules/financial-inbox/ui/components/inbox-category-resolution-actions.tsx", "utf8"),
    readFile("src/modules/financial-inbox/ui/views/inbox-item-detail-view.tsx", "utf8"),
    readFile("src/app/w/[workspaceSlug]/inbox/[inboxItemId]/page.tsx", "utf8"),
    readFile("src/app/api/workspaces/[workspaceId]/inbox/[inboxItemId]/category/route.ts", "utf8"),
  ]);

  assert.match(actions, /TransactionCategoryField/);
  assert.match(actions, /ResponsiveDialog/);
  assert.match(actions, /mobilePresentation="dialog"/);
  assert.match(actions, /aria-live="polite"/);
  assert.match(actions, /role="alert"/);
  assert.match(actions, /flex-col gap-2 sm:flex-row/);
  assert.match(actions, /createAcceptInboxCategorySuggestionRequest/);
  assert.match(actions, /createChooseInboxCategoryRequest/);
  assert.match(actions, /disabled=\{isBusy\}/);
  assert.doesNotMatch(actions, /FilterLoadingSurface/);
  assert.match(detailView, /detail\.capabilities\.canAcceptCategorySuggestion/);
  assert.match(detailView, /detail\.capabilities\.canChooseCategory/);
  assert.doesNotMatch(detailView, /detail\.reason\s*===/);
  assert.match(detailPage, /getServerTransactionCategoryOptions/);
  assert.match(route, /presentInboxCategoryResolution/);
  assert.match(route, /revalidatePath\("\/w\/\[workspaceSlug\]\/inbox"/);
});
