import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { getTransactionDetail } from "@/modules/transactions/queries/get-transaction-detail";
import { TransactionDetailActivity } from "@/modules/transactions/ui/components/transaction-detail-activity";
import { TransactionDetailCard } from "@/modules/transactions/ui/components/transaction-detail-card";
import { TransactionFinancialContext } from "@/modules/transactions/ui/components/transaction-financial-context";
import { TransactionDetailActions } from "@/modules/transactions/ui/components/transaction-detail-actions";
import { TransactionDetailSkeleton } from "@/modules/transactions/ui/components/transaction-detail-skeleton";
import { TransactionTechnicalDetails } from "@/modules/transactions/ui/components/transaction-technical-details";
import { getTransactionDetailActionLabels } from "@/modules/transactions/ui/transaction-detail-action-labels";
import { getTransactionDetailLabels } from "@/modules/transactions/ui/transaction-detail-labels";
import { getTransactionEditLabels } from "@/modules/transactions/ui/transaction-edit-labels";
import { TransactionTable } from "@/modules/transactions/ui/components/transaction-table";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { TransactionDetailView } from "@/modules/transactions/ui/views/transaction-detail-view";
import { formatDetailDate } from "@/modules/transactions/ui/components/transaction-detail-formatters";

import { InMemoryLedgerRepository, SYSTEM_GROCERIES_ID, SYSTEM_SALARY_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "detail-owner", email: "owner@pace.test", name: "Owner" };
const stranger: AuthenticatedActor = { userId: "detail-stranger", email: "stranger@pace.test", name: "Stranger" };
const viewer: AuthenticatedActor = { userId: "detail-viewer", email: "viewer@pace.test", name: "Viewer" };
const workspaceId = "detail-workspace";
const otherWorkspaceId = "detail-other-workspace";
const editCategories = [
  { id: SYSTEM_GROCERIES_ID, name: "Groceries", kind: "EXPENSE", systemKey: "expense:groceries" },
  { id: SYSTEM_SALARY_ID, name: "Salary", kind: "INCOME", systemKey: "income:salary" },
] as const;

function detailLabels(language: "en" | "fr" | "de") {
  return getTransactionDetailLabels(getDashboardLabels(language));
}

async function fixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);
  workspaces.addMembership({ workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() });
  workspaces.addMembership({ workspaceId, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: new Date() });
  workspaces.addMembership({ workspaceId: otherWorkspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() });

  const main = await service.createAccount(owner, workspaceId, { name: "Main account", type: "CHECKING", currency: "USD", openingBalanceMinor: "100000" });
  const savings = await service.createAccount(owner, workspaceId, { name: "Savings", type: "SAVINGS", currency: "USD", openingBalanceMinor: "50000" });
  const outside = await service.createAccount(owner, otherWorkspaceId, { name: "Outside", type: "CHECKING", currency: "USD" });
  const merchant = await service.createMerchant(owner, workspaceId, { name: "Carrefour Market" });
  const incomeSource = await service.createMerchant(owner, workspaceId, { name: "Pace Payroll" });

  const expense = await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: main.id, categoryId: SYSTEM_GROCERIES_ID, merchantId: merchant.id,
    amountMinor: "24850", currency: "USD", occurredAt: "2026-09-03T10:24:00.000Z",
    note: "Weekly groceries", source: { provider: "manual", origin: "MANUAL" },
  });
  await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: main.id, categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: "3500", currency: "USD", occurredAt: "2026-09-09T12:00:00.000Z",
    source: { provider: "manual", origin: "MANUAL" },
  });
  const income = await service.createTransaction(owner, workspaceId, {
    kind: "INCOME", accountId: main.id, categoryId: SYSTEM_SALARY_ID, merchantId: incomeSource.id,
    amountMinor: "750000", currency: "USD", occurredAt: "2026-09-01T09:00:00.000Z",
    note: "September payroll", source: { provider: "manual", origin: "MANUAL" },
  });
  const transfer = await service.createTransaction(owner, workspaceId, {
    kind: "TRANSFER", accountId: main.id, transferAccountId: savings.id,
    amountMinor: "10000", currency: "USD", occurredAt: "2026-09-04T10:00:00.000Z",
    note: "Move savings", source: { provider: "manual", origin: "MANUAL" },
  });
  const sparseExpense = await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: main.id, amountMinor: "100", currency: "USD",
    occurredAt: "2026-09-10T10:00:00.000Z", source: { provider: "import" },
  });
  const outsideTransaction = await service.createTransaction(owner, otherWorkspaceId, {
    kind: "EXPENSE", accountId: outside.id, amountMinor: "999", currency: "USD",
    occurredAt: "2026-09-10T10:00:00.000Z", source: { provider: "manual", origin: "MANUAL" },
  });

  const detail = (transactionId: string, actor = owner, currentWorkspaceId = workspaceId) => getTransactionDetail({
    actor,
    workspaceId: currentWorkspaceId,
    transactionId,
    timeZone: "Africa/Douala",
  }, { ledger, workspaces });

  return { detail, expense, income, transfer, sparseExpense, outsideTransaction };
}

test("an authorized member sees persisted, workspace-scoped transaction detail and ledger-derived context", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);

  assert.ok(transaction);
  assert.equal(transaction.id, expense.id);
  assert.equal(transaction.merchant?.name, "Carrefour Market");
  assert.equal(transaction.amount.minor, "24850");
  assert.deepEqual(transaction.source, { origin: "MANUAL", channel: "WEB" });
  assert.deepEqual(transaction.context.monthlyCategory, {
    categoryName: "Groceries",
    categorySystemKey: "expense:groceries",
    direction: "SPENDING",
    period: "2026-09",
    total: { currency: "USD", minor: "28350" },
  });
  assert.equal(transaction.context.accountImpacts[0]?.effect.minor, "24850");
  assert.equal(transaction.context.accountImpacts[0]?.direction, "DECREASE");
  assert.equal(transaction.capabilities.canEdit, true);
  assert.equal(transaction.capabilities.canRefund, true);
});

test("detail evaluates capabilities after workspace authorization and opens an edit flow only when policy permits", async () => {
  const { detail, expense, transfer } = await fixture();
  const [expenseDetail, transferDetail, viewerDetail] = await Promise.all([
    detail(expense.id),
    detail(transfer.id),
    detail(expense.id, viewer),
  ]);
  assert.ok(expenseDetail && transferDetail && viewerDetail);

  assert.equal(transferDetail.capabilities.canEdit, true);
  assert.equal(transferDetail.capabilities.reasons.edit, undefined);
  assert.equal(transferDetail.capabilities.canRefund, false);
  assert.equal(viewerDetail.capabilities.canEdit, false);
  assert.equal(viewerDetail.capabilities.canViewTechnicalDetails, true);

  const labels = getTransactionDetailActionLabels(getDashboardLabels("en"));
  const editLabels = getTransactionEditLabels(getDashboardLabels("en"));
  const viewerMarkup = renderToStaticMarkup(createElement(TransactionDetailActions, {
    categories: editCategories,
    editLabels,
    locale: "en-US",
    timeZone: "Africa/Douala",
    transaction: viewerDetail,
    labels,
    workspaceId,
  }));

  assert.match(viewerMarkup, /Edit transaction/);
  assert.match(viewerMarkup, /You have view-only access/);
  assert.match(viewerMarkup, /disabled=""/);
});

test("detail rejects unauthorized workspaces and hides cross-workspace transaction IDs", async () => {
  const { detail, expense, outsideTransaction } = await fixture();
  await assert.rejects(detail(expense.id, stranger), AuthorizationError);
  assert.equal(await detail(outsideTransaction.id), null);
});

test("expense, income, and transfer render their real type-specific fields", async () => {
  const { detail, expense, income, transfer } = await fixture();
  const [expenseDetail, incomeDetail, transferDetail] = await Promise.all([detail(expense.id), detail(income.id), detail(transfer.id)]);
  assert.ok(expenseDetail && incomeDetail && transferDetail);

  const labels = detailLabels("en");
  const expenseMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: expenseDetail, labels, locale: "en-US", timeZone: "Africa/Douala" }));
  const incomeMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: incomeDetail, labels, locale: "en-US", timeZone: "Africa/Douala" }));
  const transferMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: transferDetail, labels, locale: "en-US", timeZone: "Africa/Douala" }));

  assert.match(expenseMarkup, /Merchant/);
  assert.match(expenseMarkup, /Category/);
  assert.match(incomeMarkup, /Source/);
  assert.match(incomeMarkup, /September payroll/);
  assert.match(transferMarkup, /From account/);
  assert.match(transferMarkup, /To account/);
  assert.doesNotMatch(transferMarkup, /Merchant|Category/);
});

test("missing optional transaction fields leave a clean detail layout", async () => {
  const { detail, sparseExpense } = await fixture();
  const transaction = await detail(sparseExpense.id);
  assert.ok(transaction);
  assert.equal(transaction.merchant, null);
  assert.equal(transaction.category, null);
  assert.equal(transaction.note, null);

  const markup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction, labels: detailLabels("en"), locale: "en-US", timeZone: "Africa/Douala" }));
  assert.doesNotMatch(markup, /Merchant|Category|Note/);
  assert.match(markup, /Account/);
  assert.match(markup, /Status/);
});

test("financial context and activity only present available ledger facts", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const labels = detailLabels("en");
  const financialMarkup = renderToStaticMarkup(createElement(TransactionFinancialContext, { transaction, labels, locale: "en-US" }));
  const activityMarkup = renderToStaticMarkup(createElement(TransactionDetailActivity, { transaction, labels, locale: "en-US", timeZone: "Africa/Douala" }));
  assert.match(financialMarkup, /Groceries this month/);
  assert.match(financialMarkup, /\$283\.50/);
  assert.doesNotMatch(financialMarkup, /budget|%|goal/i);
  assert.match(activityMarkup, /Transaction added/);
  assert.match(activityMarkup, /Categorized as Groceries/);
  assert.match(activityMarkup, /Verified and posted/);
});

test("the complete English detail view uses the shared transaction-detail labels", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const markup = renderToStaticMarkup(createElement(TransactionDetailView, {
    categories: editCategories,
    language: "en",
    locale: "en-US",
    timeZone: "Africa/Douala",
    transaction: { ...transaction, capabilities: { ...transaction.capabilities, canEdit: false } },
    workspaceId,
    workspaceSlug: "house",
  }));

  assert.match(markup, /Transaction details/);
  assert.match(markup, /Financial context/);
  assert.match(markup, /Technical details/);
  assert.match(markup, /Ask Pace/);
  assert.match(markup, /Carrefour Market/);
  assert.match(markup, /Main account/);
  assert.match(markup, /Weekly groceries/);
});

test("the French detail view translates chrome, status, source, activity, and system categories", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const labels = detailLabels("fr");
  const detailMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, {
    transaction,
    labels,
    locale: "fr-FR",
    timeZone: "Africa/Douala",
  }));
  const financialMarkup = renderToStaticMarkup(createElement(TransactionFinancialContext, {
    transaction,
    labels,
    locale: "fr-FR",
  }));
  const activityMarkup = renderToStaticMarkup(createElement(TransactionDetailActivity, {
    transaction,
    labels,
    locale: "fr-FR",
    timeZone: "Africa/Douala",
  }));
  const technicalMarkup = renderToStaticMarkup(createElement(TransactionTechnicalDetails, {
    transaction,
    labels,
    locale: "fr-FR",
    timeZone: "Africa/Douala",
  }));

  assert.match(detailMarkup, /Détails de la transaction/);
  assert.match(detailMarkup, /Marchand/);
  assert.match(detailMarkup, /Catégorie/);
  assert.match(detailMarkup, /Comptabilisée/);
  assert.match(financialMarkup, /Courses ce mois-ci/);
  assert.match(activityMarkup, /Transaction ajoutée/);
  assert.match(activityMarkup, /Catégorisée comme Courses/);
  assert.match(technicalMarkup, /Identifiant de la transaction/);
  assert.match(detailMarkup, /Carrefour Market/);
  assert.match(detailMarkup, /Main account/);
  assert.match(detailMarkup, /Weekly groceries/);
  assert.equal(labels.source.origin.MANUAL, "Manuel");
});

test("the German detail view keeps the essential layout resilient to longer labels", async () => {
  const { detail, expense, income, transfer } = await fixture();
  const [expenseDetail, incomeDetail, transferDetail] = await Promise.all([
    detail(expense.id),
    detail(income.id),
    detail(transfer.id),
  ]);
  assert.ok(expenseDetail && incomeDetail && transferDetail);

  const labels = detailLabels("de");
  const expenseMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, {
    transaction: expenseDetail,
    labels,
    locale: "de-DE",
    timeZone: "Africa/Douala",
  }));
  const incomeMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, {
    transaction: incomeDetail,
    labels,
    locale: "de-DE",
    timeZone: "Africa/Douala",
  }));
  const transferMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, {
    transaction: transferDetail,
    labels,
    locale: "de-DE",
    timeZone: "Africa/Douala",
  }));
  const viewMarkup = renderToStaticMarkup(createElement(TransactionDetailView, {
    categories: editCategories,
    language: "de",
    locale: "de-DE",
    timeZone: "Africa/Douala",
    transaction: { ...expenseDetail, capabilities: { ...expenseDetail.capabilities, canEdit: false } },
    workspaceId,
    workspaceSlug: "house",
  }));

  assert.match(expenseMarkup, /Transaktionsdetails/);
  assert.match(expenseMarkup, /Händler/);
  assert.match(expenseMarkup, /Lebensmittel/);
  assert.match(incomeMarkup, /Quelle/);
  assert.match(transferMarkup, /Von Konto/);
  assert.match(transferMarkup, /Auf Konto/);
  assert.match(expenseMarkup, /sm:grid-cols-\[minmax\(10.5rem,13.25rem\)_minmax\(0,1fr\)\]/);
  assert.match(viewMarkup, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(290px,320px\)\]/);
  assert.equal(labels.source.origin.MANUAL, "Manuell");
});

test("detail actions and machine-readable capability reasons use localized dashboard copy", () => {
  const english = getTransactionDetailActionLabels(getDashboardLabels("en"));
  const french = getTransactionDetailActionLabels(getDashboardLabels("fr"));
  const german = getTransactionDetailActionLabels(getDashboardLabels("de"));

  assert.notEqual(french.edit, english.edit);
  assert.notEqual(german.edit, english.edit);
  assert.notEqual(french.createRefund, english.createRefund);
  assert.notEqual(german.createRefund, english.createRefund);
  assert.notEqual(french.unavailable.READ_ONLY_ROLE, english.unavailable.READ_ONLY_ROLE);
  assert.notEqual(german.unavailable.IMPORTED_TRANSACTION_RESTRICTED, english.unavailable.IMPORTED_TRANSACTION_RESTRICTED);
});

test("Ask Pace receives serializable translated templates across the server-client boundary", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const askPace = detailLabels(language).askPace;
    assert.ok(Object.values(askPace).every((value) => typeof value === "string"), language);
  }
});

test("detail date and system-category presentation follow locale without changing user data", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  assert.match(formatDetailDate(transaction.occurredAt, "en-US", "Africa/Douala"), /September/);
  assert.match(formatDetailDate(transaction.occurredAt, "fr-FR", "Africa/Douala"), /septembre/);
  assert.match(formatDetailDate(transaction.occurredAt, "de-DE", "Africa/Douala"), /September/);
  assert.equal(detailLabels("fr").systemCategory(transaction.category!), "Courses");

  const customCategoryMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, {
    transaction: {
      ...transaction,
      category: { id: "workspace-category", name: "Custom household", systemKey: null },
    },
    labels: detailLabels("fr"),
    locale: "fr-FR",
    timeZone: "Africa/Douala",
  }));
  assert.match(customCategoryMarkup, /Custom household/);
});

test("technical details start collapsed and keep operational metadata secondary", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const markup = renderToStaticMarkup(createElement(TransactionTechnicalDetails, { transaction, labels: detailLabels("en"), locale: "en-US", timeZone: "Africa/Douala" }));
  assert.match(markup, /<details/);
  assert.doesNotMatch(markup, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(markup, /Transaction ID/);
  assert.doesNotMatch(markup, /deduplication|fingerprint/i);
});

test("detail view stacks safely below desktop and list-detail affordances remain responsive", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const markup = renderToStaticMarkup(createElement(TransactionDetailView, {
    categories: editCategories,
    transaction: {
      ...transaction,
      capabilities: { ...transaction.capabilities, canEdit: false },
    },
    workspaceSlug: "house",
    workspaceId,
    language: "en",
    locale: "en-US",
    timeZone: "Africa/Douala",
  }));
  assert.match(markup, /xl:grid-cols-\[minmax\(0,1fr\)_minmax\(290px,320px\)\]/);
  assert.match(markup, /xl:sticky/);
  assert.match(markup, /\/w\/house\/transactions/);
});

test("a real list record exposes the canonical workspace-safe detail link", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const markup = renderToStaticMarkup(createElement(TransactionTable, {
    transactions: [{
      id: transaction.id,
      merchant: { name: transaction.merchant?.name ?? "Expense" },
      amount: transaction.amount,
      kind: transaction.kind,
      category: transaction.category ? { key: transaction.category.systemKey ?? transaction.category.id, label: transaction.category.name } : null,
      account: transaction.account ? { id: transaction.account.id, displayName: transaction.account.name } : null,
      occurredAt: transaction.occurredAt,
      status: transaction.status,
    }],
    getDetailHref: (item) => `/w/house/transactions/${item.id}`,
    labels: getTransactionUiLabels(getDashboardLabels("en")),
    locale: "en-US",
    now: "2026-09-10T12:00:00.000Z",
    timeZone: "Africa/Douala",
  }));
  assert.match(markup, new RegExp(`/w/house/transactions/${transaction.id}`));
});

test("the route-level not-found and loading states are Pace-aligned", () => {
  const notFoundLabels = detailLabels("en").notFound;
  const loadingMarkup = renderToStaticMarkup(createElement(TransactionDetailSkeleton, { loadingLabel: detailLabels("en").loading }));
  assert.equal(notFoundLabels.eyebrow, "Transaction unavailable");
  assert.equal(notFoundLabels.back, "Back to transactions");
  assert.match(loadingMarkup, /aria-busy="true"/);
  assert.match(loadingMarkup, /Loading transaction/);
});

test("production detail code has no fixture or mock transaction rendering path", async () => {
  const files = [
    "src/modules/transactions/queries/get-transaction-detail.ts",
    "src/modules/transactions/server/get-transaction-detail.ts",
    "src/modules/transactions/ui/views/transaction-detail-view.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /\b(?:fixture|mock|demo|sample)\b/i, file);
  }
});

test("production detail components contain no accidental hardcoded English UI copy", async () => {
  const files = [
    "src/modules/transactions/ui/views/transaction-detail-view.tsx",
    "src/modules/transactions/ui/components/transaction-detail-activity.tsx",
    "src/modules/transactions/ui/components/transaction-detail-ask-pace.tsx",
    "src/modules/transactions/ui/components/transaction-detail-card.tsx",
    "src/modules/transactions/ui/components/transaction-detail-hero.tsx",
    "src/modules/transactions/ui/components/transaction-financial-context.tsx",
    "src/modules/transactions/ui/components/transaction-source-information.tsx",
    "src/modules/transactions/ui/components/transaction-technical-details.tsx",
  ];
  const accidentalUiCopy = /["`](?:Transactions|Transaction details|Financial context|Activity|Technical details|Merchant|Source|Category|Account|From account|To account|Date|Time|Note|Status|Manual|Recorded in Pace|Transaction added|Verified and posted|Ask Pace|Loading transaction)["`]/;

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, accidentalUiCopy, file);
  }
});
