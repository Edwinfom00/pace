import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { DEFAULT_TRANSACTION_FILTER_STATE, transactionListHref } from "@/modules/transactions/domain/transaction-list-url";
import { parsePacePageContext } from "@/modules/pace-assistant/domain/page-context";
import { getTransactionsPage } from "@/modules/transactions/queries/get-transactions-page";
import { parseTransactionSearchParams } from "@/modules/transactions/queries/transaction-search-params";
import { startOfWorkspaceDay } from "@/modules/transactions/queries/workspace-date-range";
import { LedgerService } from "@/modules/ledger/ledger-service";
import { correctTransactionForActor } from "@/modules/ledger/correct-transaction";
import { calculateIncomeAndSpendingTotals } from "@/modules/ledger/totals";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
  SYSTEM_TRANSPORT_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const stranger: AuthenticatedActor = { userId: "stranger-1", email: "stranger@pace.test", name: "Stranger" };
const workspaceId = "workspace-one";
const otherWorkspaceId = "workspace-two";

async function fixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);
  for (const [id, userId] of [[workspaceId, owner.userId], [otherWorkspaceId, owner.userId]] as const) {
    workspaces.addMembership({ workspaceId: id, userId, role: "OWNER", invitedByUserId: null, joinedAt: new Date() });
  }

  const checking = await service.createAccount(owner, workspaceId, { name: "Main account", type: "CHECKING", currency: "USD" });
  const card = await service.createAccount(owner, workspaceId, { name: "Visa •••• 4242", type: "CREDIT_CARD", currency: "EUR" });
  const savings = await service.createAccount(owner, workspaceId, { name: "Savings", type: "SAVINGS", currency: "USD" });
  const outside = await service.createAccount(owner, otherWorkspaceId, { name: "Outside", type: "CHECKING", currency: "USD" });
  const carrefour = await service.createMerchant(owner, workspaceId, { name: "Carrefour Market" });
  const yango = await service.createMerchant(owner, workspaceId, { name: "Yango" });

  const expense = await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: checking.id, categoryId: SYSTEM_GROCERIES_ID, merchantId: carrefour.id,
    amountMinor: "24850", currency: "USD", occurredAt: "2026-09-03T00:20:00.000Z", note: "Weekly groceries",
  });
  await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: checking.id, categoryId: SYSTEM_TRANSPORT_ID, merchantId: yango.id,
    amountMinor: "3500", currency: "USD", occurredAt: "2026-09-02T12:00:00.000Z", note: "Airport trip",
  });
  await service.createTransaction(owner, workspaceId, {
    kind: "INCOME", accountId: checking.id, categoryId: SYSTEM_SALARY_ID,
    amountMinor: "750000", currency: "USD", occurredAt: "2026-09-01T09:00:00.000Z", note: "September payroll",
  });
  await service.createTransaction(owner, workspaceId, {
    kind: "TRANSFER", accountId: checking.id, transferAccountId: savings.id,
    amountMinor: "10000", currency: "USD", occurredAt: "2026-08-31T23:30:00.000Z", note: "Move savings",
  });
  await service.createRefund(owner, {
    workspaceId,
    expenseTransactionId: expense.id,
    amountMinor: 500n,
    currency: toCurrencyCode("USD"),
    accountId: checking.id,
    occurredAt: new Date("2026-09-04T10:00:00.000Z"),
    note: "Partial refund",
    idempotencyKey: "10000000-0000-4000-8000-000000000002",
  });
  await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE", accountId: card.id, categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: "8800", currency: "EUR", occurredAt: "2026-09-05T10:00:00.000Z", note: "French market",
  });
  await service.createTransaction(owner, otherWorkspaceId, {
    kind: "EXPENSE", accountId: outside.id, categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: "999", currency: "USD", occurredAt: "2026-09-06T10:00:00.000Z", note: "Outside workspace",
  });

  const page = (overrides: Partial<ReturnType<typeof parseTransactionSearchParams>> = {}) => getTransactionsPage({
    actor: owner,
    workspaceId,
    filters: { ...parseTransactionSearchParams({}), ...overrides },
    timeZone: "Africa/Douala",
    unknownMerchantName: "Transaction",
  }, { ledger, workspaces });

  return { page, checking, card, ledger, service, workspaces };
}

test("transaction search params are typed, bounded, and independently fall back safely", () => {
  assert.deepEqual(parseTransactionSearchParams({
    page: "not-a-page", type: "expense", category: "invalid", account: "bad", from: "2026-02-31", to: "2026-09-30", sort: "sideways", q: "  Carrefour  ",
  }), {
    ...DEFAULT_TRANSACTION_FILTER_STATE,
    page: 1,
    pageSize: 20,
    search: "Carrefour",
    kind: "EXPENSE",
    categoryId: undefined,
    accountId: undefined,
    from: undefined,
    to: "2026-09-30",
    sort: "NEWEST",
  });
  assert.equal(parseTransactionSearchParams({ from: "2026-10-02", to: "2026-10-01" }).from, undefined);
  assert.equal(
    transactionListHref("/w/house/transactions", {
      page: 3, search: "Carrefour", kind: "EXPENSE", categoryId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222", from: "2026-09-01", to: "2026-09-30", sort: "OLDEST",
    }),
    "/w/house/transactions?page=3&q=Carrefour&type=EXPENSE&category=11111111-1111-4111-8111-111111111111&account=22222222-2222-4222-8222-222222222222&from=2026-09-01&to=2026-09-30&sort=OLDEST",
  );
});

test("Pace receives typed transaction filter context and never the financial dataset", () => {
  const context = {
    page: "transactions" as const,
    filters: {
      search: "Carrefour",
      type: "EXPENSE" as const,
      categoryId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      from: "2026-09-01",
      to: "2026-09-30",
      sort: "NEWEST" as const,
    },
  };
  assert.deepEqual(parsePacePageContext(context), context);
  assert.equal(parsePacePageContext({ ...context, transactions: [{ id: "raw-ledger-data" }] }), null);
});

test("transaction list is authorized, workspace scoped, paginated, and mapped to bigint-safe DTOs", async () => {
  const { page, workspaces, ledger } = await fixture();
  const first = await page({ pageSize: 2 });
  const later = await page({ page: 2, pageSize: 2 });

  assert.equal(first.totalCount, 6);
  assert.equal(first.pagination.totalCount, 6);
  assert.equal(first.page, 1);
  assert.equal(first.totalPages, 3);
  assert.equal(first.items.length, 2);
  assert.equal(later.page, 2);
  assert.equal(later.items.length, 2);
  assert.equal(first.items.some((item) => item.merchant.description === "Outside workspace"), false);
  assert.equal(typeof first.items[0]?.amount.minor, "string");
  assert.equal(first.items[0]?.amount.currency.length, 3);

  await assert.rejects(
    getTransactionsPage({
      actor: stranger, workspaceId, filters: parseTransactionSearchParams({}), timeZone: "Africa/Douala", unknownMerchantName: "Transaction",
    }, { ledger, workspaces }),
    AuthorizationError,
  );
});

test("transaction list applies server-side search, type, category, account, date, and combined filters", async () => {
  const { page, checking } = await fixture();
  assert.deepEqual((await page({ search: "carrefour" })).items.map((item) => item.merchant.name), ["Carrefour Market", "Carrefour Market"]);
  assert.deepEqual((await page({ search: "airport" })).items.map((item) => item.merchant.name), ["Yango"]);
  assert.equal((await page({ search: "no match" })).totalCount, 0);
  assert.equal((await page({ kind: "EXPENSE" })).totalCount, 3);
  assert.equal((await page({ kind: "INCOME" })).totalCount, 1);
  assert.equal((await page({ kind: "TRANSFER" })).totalCount, 1);
  assert.equal((await page({ kind: "REFUND" })).totalCount, 1);
  assert.equal((await page({ categoryId: SYSTEM_TRANSPORT_ID })).items[0]?.merchant.name, "Yango");
  assert.equal((await page({ accountId: checking.id })).totalCount, 5);
  assert.equal((await page({ from: "2026-09-03", to: "2026-09-03" })).items[0]?.merchant.name, "Carrefour Market");
  assert.equal((await page({ accountId: checking.id, categoryId: SYSTEM_GROCERIES_ID, kind: "EXPENSE" })).totalCount, 1);
});

test("the transaction list exposes only the terminal replacement from an expense correction chain", async () => {
  const { checking, ledger, page, service, workspaces } = await fixture();
  const now = new Date("2026-09-01T00:00:00.000Z");
  workspaces.workspaces.set(workspaceId, {
    id: workspaceId,
    name: "Workspace one",
    slug: "workspace-one",
    type: "CUSTOM",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  });
  workspaces.preferences.set(workspaceId, {
    workspaceId,
    currency: "USD",
    locale: "en-US",
    timezone: "Africa/Douala",
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  });
  const santaLucia = await service.createMerchant(owner, workspaceId, { name: "Santa Lucia" });
  const original = await service.createTransaction(owner, workspaceId, {
    kind: "EXPENSE",
    accountId: checking.id,
    categoryId: SYSTEM_GROCERIES_ID,
    merchantId: santaLucia.id,
    amountMinor: "10000",
    currency: "USD",
    occurredAt: "2026-09-06T10:00:00.000Z",
  });

  const first = await correctTransactionForActor(owner, {
    workspaceId,
    transactionId: original.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: "9000" },
    idempotencyKey: "b0000000-0000-4000-8000-000000000611",
  }, { ledger: service });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const firstChain = first.correction;
  assert.equal(ledger.transactions.get(original.id)?.amountMinor, 10000n);
  assert.equal(ledger.transactions.get(firstChain.reversalTransaction.id)?.reversalOfTransactionId, original.id);
  assert.equal(ledger.transactions.get(firstChain.replacementTransaction.id)?.amountMinor, 9000n);
  assert.equal(ledger.transactionCorrections.size, 1);
  assert.deepEqual(
    (await page({ search: "Santa Lucia" })).items.map((item) => [item.id, item.amount.minor, item.kind]),
    [[firstChain.replacementTransaction.id, "9000", "EXPENSE"]],
  );
  assert.deepEqual(
    calculateIncomeAndSpendingTotals(
      [original, firstChain.reversalTransaction, firstChain.replacementTransaction].map(
        ({ id }) => ledger.transactions.get(id)!,
      ),
      "USD",
    ),
    { incomeMinor: 0n, spendingMinor: 9000n },
  );

  const second = await correctTransactionForActor(owner, {
    workspaceId,
    transactionId: firstChain.replacementTransaction.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: "8000" },
    idempotencyKey: "b0000000-0000-4000-8000-000000000612",
  }, { ledger: service });
  assert.equal(second.ok, true);
  if (!second.ok) return;

  const secondChain = second.correction;
  assert.equal(ledger.transactionCorrections.size, 2);
  assert.equal(
    [...ledger.transactions.values()].filter((transaction) => transaction.workspaceId === workspaceId).length,
    11,
    "the original, both reversals, and both replacements remain persisted",
  );
  assert.deepEqual(
    (await page({ search: "Santa Lucia" })).items.map((item) => [item.id, item.amount.minor, item.kind]),
    [[secondChain.replacementTransaction.id, "8000", "EXPENSE"]],
  );
  assert.deepEqual(
    calculateIncomeAndSpendingTotals(
      [
        original,
        firstChain.reversalTransaction,
        firstChain.replacementTransaction,
        secondChain.reversalTransaction,
        secondChain.replacementTransaction,
      ].map(({ id }) => ledger.transactions.get(id)!),
      "USD",
    ),
    { incomeMinor: 0n, spendingMinor: 8000n },
  );
});

test("stale filters fall back, workspace timezone date boundaries are respected, and amount sorting is currency-safe", async () => {
  const { page, checking } = await fixture();
  const stale = await page({ accountId: "11111111-1111-4111-8111-111111111111", categoryId: "22222222-2222-4222-8222-222222222222" });
  assert.equal(stale.filters.accountId, undefined);
  assert.equal(stale.filters.categoryId, undefined);
  assert.equal(startOfWorkspaceDay("2026-09-03", "Africa/Douala").toISOString(), "2026-09-02T23:00:00.000Z");

  const multiCurrency = await page({ sort: "HIGHEST" });
  assert.equal(multiCurrency.amountSortingAvailable, false);
  assert.equal(multiCurrency.filters.sort, "NEWEST");
  const usd = await page({ accountId: checking.id, sort: "HIGHEST" });
  assert.equal(usd.amountSortingAvailable, true);
  assert.equal(usd.filters.sort, "HIGHEST");
  assert.deepEqual(usd.items.map((item) => item.amount.minor), ["750000", "24850", "10000", "3500", "500"]);
  assert.deepEqual((await page({ accountId: checking.id, sort: "LOWEST" })).items.map((item) => item.amount.minor), ["500", "3500", "10000", "24850", "750000"]);
});
