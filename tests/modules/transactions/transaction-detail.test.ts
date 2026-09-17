import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import TransactionDetailNotFound from "@/app/w/[workspaceSlug]/transactions/[transactionId]/not-found";
import { getDashboardLabels } from "@/i18n/dashboard-messages";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { getTransactionDetail } from "@/modules/transactions/queries/get-transaction-detail";
import { TransactionDetailActivity } from "@/modules/transactions/ui/components/transaction-detail-activity";
import { TransactionDetailCard } from "@/modules/transactions/ui/components/transaction-detail-card";
import { TransactionFinancialContext } from "@/modules/transactions/ui/components/transaction-financial-context";
import { TransactionDetailSkeleton } from "@/modules/transactions/ui/components/transaction-detail-skeleton";
import { TransactionTechnicalDetails } from "@/modules/transactions/ui/components/transaction-technical-details";
import { TransactionTable } from "@/modules/transactions/ui/components/transaction-table";
import { getTransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";
import { TransactionDetailView } from "@/modules/transactions/ui/views/transaction-detail-view";

import { InMemoryLedgerRepository, SYSTEM_GROCERIES_ID, SYSTEM_SALARY_ID } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "detail-owner", email: "owner@pace.test", name: "Owner" };
const stranger: AuthenticatedActor = { userId: "detail-stranger", email: "stranger@pace.test", name: "Stranger" };
const workspaceId = "detail-workspace";
const otherWorkspaceId = "detail-other-workspace";

async function fixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);
  workspaces.addMembership({ workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() });
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
  assert.equal(transaction.source?.label, "Added manually");
  assert.deepEqual(transaction.context.monthlyCategory, {
    categoryName: "Groceries",
    direction: "SPENDING",
    period: "2026-09",
    total: { currency: "USD", minor: "28350" },
  });
  assert.equal(transaction.context.accountImpacts[0]?.effect.minor, "24850");
  assert.equal(transaction.context.accountImpacts[0]?.direction, "DECREASE");
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

  const expenseMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: expenseDetail, locale: "en-US", timeZone: "Africa/Douala" }));
  const incomeMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: incomeDetail, locale: "en-US", timeZone: "Africa/Douala" }));
  const transferMarkup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction: transferDetail, locale: "en-US", timeZone: "Africa/Douala" }));

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

  const markup = renderToStaticMarkup(createElement(TransactionDetailCard, { transaction, locale: "en-US", timeZone: "Africa/Douala" }));
  assert.doesNotMatch(markup, /Merchant|Category|Note/);
  assert.match(markup, /Account/);
  assert.match(markup, /Status/);
});

test("financial context and activity only present available ledger facts", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const financialMarkup = renderToStaticMarkup(createElement(TransactionFinancialContext, { transaction, locale: "en-US" }));
  const activityMarkup = renderToStaticMarkup(createElement(TransactionDetailActivity, { transaction, locale: "en-US", timeZone: "Africa/Douala" }));
  assert.match(financialMarkup, /Groceries this month/);
  assert.match(financialMarkup, /\$283\.50/);
  assert.doesNotMatch(financialMarkup, /budget|%|goal/i);
  assert.match(activityMarkup, /Transaction added/);
  assert.match(activityMarkup, /Categorized as Groceries/);
  assert.match(activityMarkup, /Verified and posted/);
});

test("technical details start collapsed and keep operational metadata secondary", async () => {
  const { detail, expense } = await fixture();
  const transaction = await detail(expense.id);
  assert.ok(transaction);

  const markup = renderToStaticMarkup(createElement(TransactionTechnicalDetails, { transaction, locale: "en-US", timeZone: "Africa/Douala" }));
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
    transaction,
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
  const notFoundMarkup = renderToStaticMarkup(createElement(TransactionDetailNotFound));
  const loadingMarkup = renderToStaticMarkup(createElement(TransactionDetailSkeleton));
  assert.match(notFoundMarkup, /Transaction unavailable/);
  assert.match(notFoundMarkup, /Back to transactions/);
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
