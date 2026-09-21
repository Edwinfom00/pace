import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { AuthorizationError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";
import { LedgerService } from "@/modules/ledger/ledger-service";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
  SYSTEM_SALARY_ID,
} from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const occurredAt = new Date("2026-09-20T10:00:00.000Z");

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  const now = new Date("2026-09-20T00:00:00.000Z");

  for (const [workspaceId, currency] of [[workspaceOne, "XAF"], [workspaceTwo, "XAF"]] as const) {
    workspaces.workspaces.set(workspaceId, {
      id: workspaceId,
      name: workspaceId,
      slug: workspaceId,
      type: "CUSTOM",
      createdByUserId: owner.userId,
      createdAt: now,
      updatedAt: now,
    });
    workspaces.preferences.set(workspaceId, {
      workspaceId,
      currency,
      locale: "en-US",
      timezone: "Africa/Douala",
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    });
    workspaces.addMembership({ workspaceId, userId: owner.userId, role: "OWNER", invitedByUserId: null, joinedAt: now });
  }
  workspaces.addMembership({ workspaceId: workspaceOne, userId: viewer.userId, role: "VIEWER", invitedByUserId: null, joinedAt: now });

  return { ledger, records };
}

async function createAccount(
  ledger: LedgerService,
  input: { name: string; currency?: string; openingBalanceMinor?: bigint },
) {
  return ledger.createAccount(owner, workspaceOne, {
    type: "CHECKING",
    currency: input.currency ?? "XAF",
    name: input.name,
    openingBalanceMinor: input.openingBalanceMinor ?? 0n,
  });
}

async function post(
  ledger: LedgerService,
  input: {
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
    accountId: string;
    transferAccountId?: string;
    amountMinor: bigint;
    currency?: string;
    status?: "POSTED" | "PENDING";
  },
) {
  const common = {
    accountId: input.accountId,
    amountMinor: input.amountMinor,
    currency: input.currency ?? "XAF",
    status: input.status ?? "POSTED",
    occurredAt,
    source: { provider: "test" },
  };
  if (input.kind === "TRANSFER") {
    return ledger.createTransaction(owner, workspaceOne, {
      ...common,
      kind: "TRANSFER",
      transferAccountId: input.transferAccountId!,
    });
  }
  return ledger.createTransaction(owner, workspaceOne, {
    ...common,
    kind: input.kind,
    categoryId: input.kind === "EXPENSE" ? SYSTEM_GROCERIES_ID : SYSTEM_SALARY_ID,
  });
}

async function balance(ledger: LedgerService, accountId: string) {
  return ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId });
}

test("current balance starts at opening balance and applies posted expenses, income, and refunds exactly", async () => {
  const { ledger } = await fixture();
  const empty = await createAccount(ledger, { name: "Empty" });
  const expenses = await createAccount(ledger, { name: "Expenses", openingBalanceMinor: 1_500n });
  const income = await createAccount(ledger, { name: "Income", openingBalanceMinor: 1_000n });
  const mixed = await createAccount(ledger, { name: "Mixed" });
  const refunded = await createAccount(ledger, { name: "Refunded" });

  await post(ledger, { kind: "EXPENSE", accountId: expenses.id, amountMinor: 500n });
  await post(ledger, { kind: "INCOME", accountId: income.id, amountMinor: 500n });
  await post(ledger, { kind: "INCOME", accountId: mixed.id, amountMinor: 1_000n });
  await post(ledger, { kind: "EXPENSE", accountId: mixed.id, amountMinor: 200n });
  await post(ledger, { kind: "EXPENSE", accountId: mixed.id, amountMinor: 300n });
  await post(ledger, { kind: "INCOME", accountId: mixed.id, amountMinor: 999n, status: "PENDING" });
  const expense = await post(ledger, { kind: "EXPENSE", accountId: refunded.id, amountMinor: 100n });
  await ledger.createRefund(owner, {
    workspaceId: workspaceOne,
    expenseTransactionId: expense.id,
    accountId: refunded.id,
    amountMinor: 40n,
    currency: toCurrencyCode("XAF"),
    occurredAt,
    idempotencyKey: randomUUID(),
  });

  assert.equal((await balance(ledger, empty.id)).currentBalanceMinor, 0n);
  assert.equal((await balance(ledger, expenses.id)).currentBalanceMinor, 1_000n);
  assert.equal((await balance(ledger, income.id)).currentBalanceMinor, 1_500n);
  assert.equal((await balance(ledger, mixed.id)).currentBalanceMinor, 500n);
  assert.equal((await balance(ledger, refunded.id)).currentBalanceMinor, -60n);
});

test("transfers change both account balances, balances stay per currency, and the workspace read is one batch call", async () => {
  const { ledger, records } = await fixture();
  const from = await createAccount(ledger, { name: "From", openingBalanceMinor: 1_000n });
  const to = await createAccount(ledger, { name: "To", openingBalanceMinor: 500n });
  const euro = await createAccount(ledger, { name: "Euro", currency: "EUR", openingBalanceMinor: 200n });
  await post(ledger, { kind: "TRANSFER", accountId: from.id, transferAccountId: to.id, amountMinor: 300n });

  const balances = await ledger.getWorkspaceAccountBalances(owner, { workspaceId: workspaceOne });
  const byId = new Map(balances.map((entry) => [entry.accountId, entry]));
  assert.equal(records.workspaceAccountBalancesReadCount, 1);
  assert.equal(records.accountBalanceReadCount, 0);
  assert.deepEqual(byId.get(from.id), {
    accountId: from.id,
    currency: toCurrencyCode("XAF"),
    currentBalanceMinor: 700n,
    availableBalanceMinor: 700n,
    spendabilityMode: "ZERO_FLOOR",
  });
  assert.deepEqual(byId.get(to.id), {
    accountId: to.id,
    currency: toCurrencyCode("XAF"),
    currentBalanceMinor: 800n,
    availableBalanceMinor: 800n,
    spendabilityMode: "ZERO_FLOOR",
  });
  assert.deepEqual(byId.get(euro.id), {
    accountId: euro.id,
    currency: toCurrencyCode("EUR"),
    currentBalanceMinor: 200n,
    availableBalanceMinor: 200n,
    spendabilityMode: "ZERO_FLOOR",
  });
  assert.equal(Object.hasOwn(byId.get(euro.id)!, "totalBalance"), false);
});

test("corrections and manual reversals leave only the effective account impact, including both transfer legs", async () => {
  const { ledger } = await fixture();
  const corrected = await createAccount(ledger, { name: "Corrected", openingBalanceMinor: 1_000n });
  const replacement = await createAccount(ledger, { name: "Replacement", openingBalanceMinor: 1_000n });
  const chained = await createAccount(ledger, { name: "Chained", openingBalanceMinor: 1_000n });
  const reversal = await createAccount(ledger, { name: "Reversal", openingBalanceMinor: 1_000n });
  const transferFrom = await createAccount(ledger, { name: "Transfer from", openingBalanceMinor: 1_000n });
  const transferTo = await createAccount(ledger, { name: "Transfer to", openingBalanceMinor: 500n });

  const amountCorrection = await post(ledger, { kind: "EXPENSE", accountId: corrected.id, amountMinor: 100n });
  await ledger.correctTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: amountCorrection.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 90n },
    idempotencyKey: randomUUID(),
  });

  const accountCorrection = await post(ledger, { kind: "EXPENSE", accountId: corrected.id, amountMinor: 100n });
  await ledger.correctTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: accountCorrection.id,
    kind: "EXPENSE",
    financialChanges: { accountId: replacement.id },
    idempotencyKey: randomUUID(),
  });

  const chainStart = await post(ledger, { kind: "EXPENSE", accountId: chained.id, amountMinor: 100n });
  const first = await ledger.correctTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: chainStart.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 90n },
    idempotencyKey: randomUUID(),
  });
  const second = await ledger.correctTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: first.replacementTransaction.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 80n },
    idempotencyKey: randomUUID(),
  });
  await ledger.correctTransaction(owner, {
    workspaceId: workspaceOne,
    transactionId: second.replacementTransaction.id,
    kind: "EXPENSE",
    financialChanges: { amountMinor: 75n },
    idempotencyKey: randomUUID(),
  });

  const reversedExpense = await post(ledger, { kind: "EXPENSE", accountId: reversal.id, amountMinor: 100n });
  const reversedIncome = await post(ledger, { kind: "INCOME", accountId: reversal.id, amountMinor: 100n });
  const transfer = await post(ledger, {
    kind: "TRANSFER",
    accountId: transferFrom.id,
    transferAccountId: transferTo.id,
    amountMinor: 100n,
  });
  for (const transaction of [reversedExpense, reversedIncome, transfer]) {
    await ledger.reverseTransaction(owner, {
      workspaceId: workspaceOne,
      transactionId: transaction.id,
      idempotencyKey: randomUUID(),
    });
  }

  assert.equal((await balance(ledger, corrected.id)).currentBalanceMinor, 910n);
  assert.equal((await balance(ledger, replacement.id)).currentBalanceMinor, 900n);
  assert.equal((await balance(ledger, chained.id)).currentBalanceMinor, 925n);
  assert.equal((await balance(ledger, reversal.id)).currentBalanceMinor, 1_000n);
  assert.equal((await balance(ledger, transferFrom.id)).currentBalanceMinor, 1_000n);
  assert.equal((await balance(ledger, transferTo.id)).currentBalanceMinor, 500n);
});

test("balance reads retain archived history and reject foreign-workspace account ids", async () => {
  const { ledger, records } = await fixture();
  const archived = await createAccount(ledger, { name: "Archived", openingBalanceMinor: 500n });
  await post(ledger, { kind: "EXPENSE", accountId: archived.id, amountMinor: 100n });
  records.accounts.set(archived.id, { ...archived, archivedAt: new Date("2026-09-20T12:00:00.000Z") });
  const foreign = await ledger.createAccount(owner, workspaceTwo, {
    name: "Foreign", type: "CHECKING", currency: "XAF", openingBalanceMinor: 1_000n,
  });

  assert.equal((await balance(ledger, archived.id)).currentBalanceMinor, 400n);
  assert.equal((await ledger.getAccountBalance(viewer, {
    workspaceId: workspaceOne,
    accountId: archived.id,
  })).currentBalanceMinor, 400n);
  await assert.rejects(
    ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: foreign.id }),
    NotFoundError,
  );
  await assert.rejects(
    ledger.getAccountBalance(viewer, { workspaceId: workspaceTwo, accountId: foreign.id }),
    AuthorizationError,
  );
});
