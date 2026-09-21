import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import {
  getAccountActionPolicy,
  isAccountTypeChangeAllowed,
} from "@/modules/ledger/account-action-policy";
import { LedgerService } from "@/modules/ledger/ledger-service";
import {
  manageAccountForActor,
  type ManageAccountResult,
} from "@/modules/ledger/manage-account";
import { mapTransactionAccountOption } from "@/modules/transactions/queries/get-transaction-account-options";

import {
  InMemoryLedgerRepository,
  SYSTEM_GROCERIES_ID,
} from "../../support/in-memory-ledger-repository";
import { createAccountWithOpeningBalance } from "../../support/opening-balance";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function fixture() {
  const records = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const ledger = new LedgerService(records, workspaces);
  for (const [workspaceId, userId, role] of [
    [workspaceOne, owner.userId, "OWNER"],
    [workspaceTwo, owner.userId, "OWNER"],
    [workspaceOne, viewer.userId, "VIEWER"],
  ] as const) {
    workspaces.addMembership({ workspaceId, userId, role, invitedByUserId: null, joinedAt: new Date() });
  }
  return { records, ledger };
}

async function createAccount(
  ledger: LedgerService,
  input: { name: string; type?: "CASH" | "CHECKING" | "MOBILE_MONEY"; openingBalanceMinor?: bigint; workspaceId?: string },
) {
  return createAccountWithOpeningBalance(ledger, owner, input.workspaceId ?? workspaceOne, {
    name: input.name,
    type: input.type ?? "CHECKING",
    currency: "XAF",
    openingBalanceMinor: input.openingBalanceMinor,
  });
}

async function postExpense(ledger: LedgerService, accountId: string) {
  return ledger.createTransaction(owner, workspaceOne, {
    kind: "EXPENSE",
    status: "POSTED",
    accountId,
    categoryId: SYSTEM_GROCERIES_ID,
    amountMinor: 100n,
    currency: "XAF",
    occurredAt: new Date("2026-09-21T09:00:00.000Z"),
    source: { provider: "test" },
  });
}

async function manage(
  ledger: LedgerService,
  actor: AuthenticatedActor | null,
  input: Record<string, unknown>,
): Promise<ManageAccountResult> {
  return manageAccountForActor(actor, input, { ledger });
}

function succeeded(result: ManageAccountResult) {
  if (!result.ok) assert.fail(`Expected account management success, got ${result.code}.`);
  return result.account;
}

test("the canonical account policy exposes role, lifecycle, type, and delete rules", () => {
  const active = { type: "CASH" as const, archivedAt: null };
  const ownerPolicy = getAccountActionPolicy({ account: active, workspaceRole: "OWNER", hasFinancialActivity: false });
  assert.equal(ownerPolicy.canRename, true);
  assert.equal(ownerPolicy.canArchive, true);
  assert.equal(ownerPolicy.canRestore, false);
  assert.equal(ownerPolicy.canDelete, false);
  assert.deepEqual(ownerPolicy.reasons, { restore: "ACCOUNT_NOT_ARCHIVED", delete: "DELETE_NOT_SUPPORTED" });
  assert.equal(ownerPolicy.allowedTypeChanges.includes("CHECKING"), true);
  assert.equal(isAccountTypeChangeAllowed("MOBILE_MONEY", "CREDIT_CARD", false), false);

  const locked = getAccountActionPolicy({ account: active, workspaceRole: "OWNER", hasFinancialActivity: true });
  assert.equal(locked.canChangeType, false);
  assert.equal(locked.reasons.changeType, "ACCOUNT_HAS_FINANCIAL_ACTIVITY");

  const readOnly = getAccountActionPolicy({ account: active, workspaceRole: "VIEWER", hasFinancialActivity: false });
  assert.equal(readOnly.canRename, false);
  assert.equal(readOnly.reasons.rename, "READ_ONLY_ROLE");
});

test("rename changes only descriptive metadata and writes one account audit", async () => {
  const { records, ledger } = await fixture();
  const account = await createAccount(ledger, { name: "Main Account", openingBalanceMinor: 1_000n });
  const transaction = await postExpense(ledger, account.id);
  const beforeBalance = await ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: account.id });

  const renamed = succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne,
    accountId: account.id,
    action: "RENAME",
    name: "  Daily Account  ",
    idempotencyKey: randomUUID(),
    expectedUpdatedAt: account.updatedAt.toISOString(),
  }));

  assert.equal(renamed.id, account.id);
  assert.equal(renamed.name, "Daily Account");
  assert.equal(renamed.currency, "XAF");
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: account.id })).currentBalanceMinor, beforeBalance.currentBalanceMinor);
  assert.equal((await ledger.listTransactions(owner, workspaceOne, { accountId: account.id }))[0]?.id, transaction.id);
  const [audit] = await records.listAccountAudit(workspaceOne, account.id);
  assert.deepEqual(audit?.metadata, { before: { name: "Main Account" }, after: { name: "Daily Account" } });
  assert.equal(audit?.actorUserId, owner.userId);
  assert.equal(audit?.action, "RENAMED");
});

test("rename validates input and enforces workspace membership and management permission", async () => {
  const { ledger } = await fixture();
  const account = await createAccount(ledger, { name: "Everyday" });
  const foreign = await createAccount(ledger, { name: "Foreign", workspaceId: workspaceTwo });

  assert.deepEqual(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "RENAME", name: "   ", idempotencyKey: randomUUID(),
  }), { ok: false, code: "INVALID_ACCOUNT_NAME" });
  assert.deepEqual(await manage(ledger, viewer, {
    workspaceId: workspaceOne, accountId: account.id, action: "RENAME", name: "Blocked", idempotencyKey: randomUUID(),
  }), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: foreign.id, action: "RENAME", name: "Blocked", idempotencyKey: randomUUID(),
  }), { ok: false, code: "ACCOUNT_WORKSPACE_MISMATCH" });
});

test("type changes are safe only before activity and only within a spendability mode", async () => {
  const { records, ledger } = await fixture();
  const cash = await createAccount(ledger, { name: "Cash", type: "CASH" });
  const changed = succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: cash.id, action: "CHANGE_TYPE", type: "CHECKING", idempotencyKey: randomUUID(),
  }));
  assert.equal(changed.type, "CHECKING");
  assert.equal(changed.currency, "XAF");
  await postExpense(ledger, cash.id);
  assert.deepEqual(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: cash.id, action: "CHANGE_TYPE", type: "CASH", idempotencyKey: randomUUID(),
  }), { ok: false, code: "ACCOUNT_HAS_FINANCIAL_ACTIVITY" });

  const mobileMoney = await createAccount(ledger, { name: "MoMo", type: "MOBILE_MONEY" });
  assert.deepEqual(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: mobileMoney.id, action: "CHANGE_TYPE", type: "CREDIT_CARD", idempotencyKey: randomUUID(),
  }), { ok: false, code: "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED" });
  assert.equal((await records.findAccount(workspaceOne, mobileMoney.id))?.type, "MOBILE_MONEY");
});

test("archive preserves non-zero balance and history, blocks normal writes, and restore re-enables the account", async () => {
  const { records, ledger } = await fixture();
  const account = await createAccount(ledger, { name: "Travel", openingBalanceMinor: 1_000n });
  const transaction = await postExpense(ledger, account.id);
  const balance = await ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: account.id });
  const key = randomUUID();
  const archived = succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "ARCHIVE", idempotencyKey: key,
  }));
  assert.ok(archived.archivedAt);
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: account.id })).currentBalanceMinor, balance.currentBalanceMinor);
  assert.equal((await ledger.listTransactions(owner, workspaceOne, { accountId: account.id }))[0]?.id, transaction.id);
  assert.equal(mapTransactionAccountOption((await records.findAccount(workspaceOne, account.id))!, undefined), null);

  await assert.rejects(
    ledger.createTransactionIdempotently(owner, workspaceOne, {
      kind: "EXPENSE", status: "POSTED", accountId: account.id, categoryId: SYSTEM_GROCERIES_ID,
      amountMinor: 1n, currency: "XAF", occurredAt: new Date(), source: { provider: "test" }, deduplicationFingerprint: randomUUID(),
    }),
    (error: unknown) => Boolean(
      error
      && typeof error === "object"
      && (("code" in error && error.code === "ACCOUNT_UNAVAILABLE")
        || ("message" in error && error.message === "Archived accounts cannot accept new transactions.")),
    ),
  );

  // Same command is idempotent: it does not emit a duplicate archive audit.
  assert.equal(succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "ARCHIVE", idempotencyKey: key,
  })).id, account.id);
  assert.equal((await records.listAccountAudit(workspaceOne, account.id)).filter((audit) => audit.action === "ARCHIVED").length, 1);

  const restored = succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "RESTORE", idempotencyKey: randomUUID(),
  }));
  assert.equal(restored.archivedAt, null);
  await ledger.createTransactionIdempotently(owner, workspaceOne, {
    kind: "INCOME", status: "POSTED", accountId: account.id,
    amountMinor: 1n, currency: "XAF", occurredAt: new Date(), source: { provider: "test" }, deduplicationFingerprint: randomUUID(),
  });
  assert.equal((await records.listAccountAudit(workspaceOne, account.id)).map((audit) => audit.action).join(","), "ARCHIVED,RESTORED");
});

test("stale account management commands fail without changing immutable financial truth", async () => {
  const { ledger } = await fixture();
  const account = await createAccount(ledger, { name: "Stale", openingBalanceMinor: 500n });
  const originalVersion = account.updatedAt.toISOString();
  succeeded(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "ARCHIVE", idempotencyKey: randomUUID(), expectedUpdatedAt: originalVersion,
  }));

  assert.deepEqual(await manage(ledger, owner, {
    workspaceId: workspaceOne, accountId: account.id, action: "RENAME", name: "Late rename", idempotencyKey: randomUUID(), expectedUpdatedAt: originalVersion,
  }), { ok: false, code: "CONCURRENT_MODIFICATION" });
  assert.equal((await ledger.getAccountBalance(owner, { workspaceId: workspaceOne, accountId: account.id })).currentBalanceMinor, 500n);
});

test("archive racing a new transaction permits only a serial order", async () => {
  const { records, ledger } = await fixture();
  const account = await createAccount(ledger, { name: "Race", openingBalanceMinor: 1_000n });

  const [archiveResult, transactionResult] = await Promise.allSettled([
    manage(ledger, owner, {
      workspaceId: workspaceOne, accountId: account.id, action: "ARCHIVE", idempotencyKey: randomUUID(),
    }),
    ledger.createTransactionIdempotently(owner, workspaceOne, {
      kind: "EXPENSE", status: "POSTED", accountId: account.id, categoryId: SYSTEM_GROCERIES_ID,
      amountMinor: 100n, currency: "XAF", occurredAt: new Date(), source: { provider: "test" }, deduplicationFingerprint: randomUUID(),
    }),
  ]);

  assert.equal(archiveResult.status, "fulfilled");
  if (archiveResult.status === "fulfilled") assert.equal(archiveResult.value.ok, true);
  const stored = await records.findAccount(workspaceOne, account.id);
  assert.ok(stored?.archivedAt);
  if (transactionResult.status === "fulfilled") {
    // The write won the account lock before archival; the completed history is retained.
    assert.equal((await ledger.listTransactions(owner, workspaceOne, { accountId: account.id })).length, 1);
  } else {
    assert.ok(
      transactionResult.reason instanceof Error
      && (transactionResult.reason.message === "Archived accounts cannot accept new transactions."
        || ("code" in transactionResult.reason && transactionResult.reason.code === "ACCOUNT_UNAVAILABLE")),
    );
    assert.equal((await ledger.listTransactions(owner, workspaceOne, { accountId: account.id })).length, 0);
  }
});
