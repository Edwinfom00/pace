import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { toCurrencyCode } from "@/money/currency";
import {
  createRecurringEditDraft,
  createRecurringEditPatch,
  hasRecurringEditChanges,
  mapRecurringEditFailure,
  validateRecurringEditDraft,
  type RecurringEditSource,
} from "@/modules/recurring/ui/components/recurring-edit-flow";
import { getRecurringReviewUiLabels } from "@/modules/recurring/ui/recurring-review-ui-labels";

const source: RecurringEditSource = {
  amountMinor: "6500",
  accountId: "account-main",
  cadenceDays: 30,
  categoryId: "expense-entertainment",
  currency: toCurrencyCode("XAF"),
  name: "Netflix",
  nextOccurrenceAt: "2099-10-01T00:00:00.000Z",
};

const accounts = [{
  id: "account-main",
  name: "Main account",
  currency: toCurrencyCode("XAF"),
  availableBalanceMinor: "150000",
}, {
  id: "account-eur",
  name: "EUR account",
  currency: toCurrencyCode("EUR"),
}];

const categories = [{
  id: "expense-entertainment",
  kind: "EXPENSE" as const,
  name: "Entertainment",
  systemKey: "expense:entertainment",
}, {
  id: "income-salary",
  kind: "INCOME" as const,
  name: "Salary",
  systemKey: "income:salary",
}];

test("recurring edit derives a future-only patch and disables the no-change state", () => {
  const draft = createRecurringEditDraft(source);
  assert.deepEqual(draft, {
    amount: "6500",
    accountId: "account-main",
    cadenceDays: 30,
    categoryId: "expense-entertainment",
    name: "Netflix",
    nextOccurrence: "2099-10-01",
  });
  assert.equal(hasRecurringEditChanges(source, draft), false);
  assert.deepEqual(createRecurringEditPatch(source, draft), {});

  const changed = {
    ...draft,
    amount: "7000",
    accountId: "account-main",
    cadenceDays: 90,
    categoryId: "",
    name: "Netflix Premium",
    nextOccurrence: "2099-12-01",
  };
  assert.deepEqual(createRecurringEditPatch(source, changed), {
    amountMinor: "7000",
    cadenceDays: 90,
    categoryId: null,
    name: "Netflix Premium",
    nextOccurrenceAt: "2099-12-01T00:00:00.000Z",
  });
  assert.equal(hasRecurringEditChanges(source, changed), true);
  assert.equal("currency" in createRecurringEditPatch(source, changed), false);
  assert.equal("direction" in createRecurringEditPatch(source, changed), false);
});

test("recurring edit validates account currency and category direction only when those fields change", () => {
  const draft = createRecurringEditDraft(source);
  assert.deepEqual(validateRecurringEditDraft(source, draft, accounts, categories, "EXPENSE"), {});

  assert.deepEqual(
    validateRecurringEditDraft(source, { ...draft, accountId: "account-eur" }, accounts, categories, "EXPENSE"),
    { account: true },
  );
  assert.deepEqual(
    validateRecurringEditDraft(source, { ...draft, categoryId: "income-salary" }, accounts, categories, "EXPENSE"),
    { category: true },
  );
});

test("recurring edit maps canonical failures without leaking persistence errors", () => {
  assert.deepEqual(mapRecurringEditFailure("INVALID_RECURRING_AMOUNT"), { field: "amount" });
  assert.deepEqual(mapRecurringEditFailure("CURRENCY_MISMATCH"), { field: "account", form: "currency" });
  assert.deepEqual(mapRecurringEditFailure("CONCURRENT_MODIFICATION"), { form: "conflict" });
  assert.deepEqual(mapRecurringEditFailure("RECURRING_EDIT_NOT_ALLOWED"), { form: "notAllowed" });
  assert.deepEqual(mapRecurringEditFailure("INTERNAL_DATABASE_ERROR"), { form: "failed" });
});

test("recurring management labels are complete in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const labels = getRecurringReviewUiLabels(getDashboardLabels(language));
    assert.ok(labels.actions.edit.length > 0);
    assert.ok(labels.actions.pause.length > 0);
    assert.ok(labels.actions.resume.length > 0);
    assert.ok(labels.edit.futureOnly.length > 0);
    assert.ok(labels.pause.description.length > 0);
    assert.ok(labels.resume.description.length > 0);
  }
});

test("the existing more menu uses capability gates, canonical mutations, and no delete or skip action", async () => {
  const [actionsSource, editSource, overviewSource] = await Promise.all([
    readFile("src/modules/recurring/ui/components/recurring-review-actions.tsx", "utf8"),
    readFile("src/modules/recurring/ui/components/recurring-edit-dialog.tsx", "utf8"),
    readFile("src/modules/recurring/ui/views/recurring-overview-view.tsx", "utf8"),
  ]);
  assert.match(actionsSource, /target\.capabilities\.canEdit/);
  assert.match(actionsSource, /target\.capabilities\.canPause/);
  assert.match(actionsSource, /target\.capabilities\.canResume/);
  assert.match(editSource, /action: "UPDATE"/);
  assert.match(actionsSource, /openAction\("PAUSE"\)/);
  assert.match(actionsSource, /openAction\("RESUME"\)/);
  assert.match(overviewSource, /editOptions=\{editOptions\}/);
  assert.match(overviewSource, /editableNextOccurrenceAt/);
  assert.doesNotMatch(actionsSource + editSource, /\bDelete\b/);
  assert.doesNotMatch(actionsSource + editSource, /\bSkip\b/);
});
