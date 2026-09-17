import assert from "node:assert/strict";
import test from "node:test";

import type { AuthenticatedActor } from "@/authorization/session";
import {
  createAccountForActor,
  type CreateAccountResult,
} from "@/modules/ledger/create-account";
import { LedgerService } from "@/modules/ledger/ledger-service";

import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const viewer: AuthenticatedActor = { userId: "viewer-1", email: "viewer@pace.test", name: "Viewer" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";

async function createFixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);

  for (const [workspaceId, userId, role] of [
    [workspaceOne, owner.userId, "OWNER"],
    [workspaceTwo, owner.userId, "OWNER"],
    [workspaceOne, viewer.userId, "VIEWER"],
  ] as const) {
    workspaces.addMembership({ workspaceId, userId, role, invitedByUserId: null, joinedAt: new Date() });
  }

  return { ledger, service };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: workspaceOne,
    name: "  Travel cash  ",
    type: "CASH",
    currency: "eur",
    openingBalance: "123.45",
    ...overrides,
  };
}

function created(result: CreateAccountResult) {
  if (!result.ok) assert.fail(`Expected account creation, received ${result.code}.`);
  return result.account;
}

test("manual account creation authenticates, authorizes, trims, and returns a narrow DTO", async () => {
  const { ledger, service } = await createFixture();

  const account = created(await createAccountForActor(owner, command(), service));

  assert.deepEqual(account, {
    id: account.id,
    name: "Travel cash",
    type: "CASH",
    currency: "EUR",
  });
  assert.equal(ledger.accounts.get(account.id)?.openingBalanceMinor, 12_345n);
  assert.equal(ledger.accounts.get(account.id)?.workspaceId, workspaceOne);
  assert.equal(ledger.accounts.get(account.id)?.createdByUserId, owner.userId);
});

test("manual account creation rejects unauthenticated, unauthorized, and nonexistent workspace requests", async () => {
  const { ledger, service } = await createFixture();

  assert.deepEqual(await createAccountForActor(null, command(), service), { ok: false, code: "UNAUTHENTICATED" });
  assert.deepEqual(await createAccountForActor(viewer, command(), service), { ok: false, code: "WORKSPACE_FORBIDDEN" });
  assert.deepEqual(
    await createAccountForActor(owner, command({ workspaceId: "workspace-that-does-not-exist" }), service),
    { ok: false, code: "WORKSPACE_FORBIDDEN" },
  );
  assert.equal(ledger.accounts.size, 0);
});

test("manual account creation validates its canonical name, type, and currency fields", async () => {
  const { ledger, service } = await createFixture();

  assert.deepEqual(
    await createAccountForActor(owner, command({ name: "   " }), service),
    { ok: false, code: "INVALID_ACCOUNT_NAME" },
  );
  assert.deepEqual(
    await createAccountForActor(owner, command({ type: "EVERYDAY" }), service),
    { ok: false, code: "INVALID_ACCOUNT_TYPE" },
  );
  assert.deepEqual(
    await createAccountForActor(owner, command({ currency: "ZZZ" }), service),
    { ok: false, code: "INVALID_CURRENCY" },
  );
  assert.equal(ledger.accounts.size, 0);
});

test("the selected canonical currency is persisted without workspace-currency coercion", async () => {
  const { ledger, service } = await createFixture();

  const account = created(await createAccountForActor(owner, command({ currency: "USD", openingBalance: "0" }), service));

  assert.equal(account.currency, "USD");
  assert.equal(ledger.accounts.get(account.id)?.currency, "USD");
});

test("opening balances use exact decimal money, including zero, and reject invalid or numeric input", async () => {
  const { ledger, service } = await createFixture();

  const zero = created(await createAccountForActor(owner, command({ openingBalance: "" }), service));
  const positive = created(await createAccountForActor(owner, command({ name: "Savings", openingBalance: "0.29" }), service));

  assert.equal(ledger.accounts.get(zero.id)?.openingBalanceMinor, 0n);
  assert.equal(ledger.accounts.get(positive.id)?.openingBalanceMinor, 29n);
  assert.deepEqual(
    await createAccountForActor(owner, command({ openingBalance: "12.345" }), service),
    { ok: false, code: "INVALID_OPENING_BALANCE" },
  );
  assert.deepEqual(
    await createAccountForActor(owner, command({ openingBalance: 0.29 }), service),
    { ok: false, code: "INVALID_OPENING_BALANCE" },
  );
});

test("account creation cannot affect another workspace and a persistence failure creates no partial record", async () => {
  const { ledger, service } = await createFixture();

  const account = created(await createAccountForActor(owner, command(), service));
  assert.equal(ledger.accounts.get(account.id)?.workspaceId, workspaceOne);
  assert.equal((await service.listAccounts(owner, workspaceTwo)).length, 0);

  const failed = await createAccountForActor(owner, command({ name: "Will not persist" }), {
    createAccount: async () => {
      throw new Error("database unavailable");
    },
  });
  assert.deepEqual(failed, { ok: false, code: "ACCOUNT_CREATE_FAILED" });
  assert.equal(ledger.accounts.size, 1);
});
