import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  failedTransactionAccountOptions,
  loadTransactionAccountOptions,
} from "@/modules/transactions/domain/transaction-account-options";
import { LedgerService } from "@/modules/ledger/ledger-service";
import {
  getTransactionAccountOptions,
  mapTransactionAccountOption,
} from "@/modules/transactions/queries/get-transaction-account-options";

import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";
import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner: AuthenticatedActor = { userId: "owner-1", email: "owner@pace.test", name: "Owner" };
const stranger: AuthenticatedActor = { userId: "stranger-1", email: "stranger@pace.test", name: "Stranger" };
const workspaceOne = "workspace-one";
const workspaceTwo = "workspace-two";
const zeroAccountWorkspace = "workspace-zero";

async function fixture() {
  const ledger = new InMemoryLedgerRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new LedgerService(ledger, workspaces);

  for (const workspaceId of [workspaceOne, workspaceTwo, zeroAccountWorkspace]) {
    workspaces.addMembership({
      workspaceId,
      userId: owner.userId,
      role: "OWNER",
      invitedByUserId: null,
      joinedAt: new Date(),
    });
  }

  const active = await service.createAccount(owner, workspaceOne, { name: "Everyday", type: "CHECKING", currency: "XAF" });
  const archived = await service.createAccount(owner, workspaceOne, { name: "Previous bank", type: "CHECKING", currency: "EUR" });
  const archivedRecord = { ...archived, archivedAt: new Date("2026-09-01T00:00:00.000Z") };
  ledger.accounts.set(archived.id, archivedRecord);
  const outside = await service.createAccount(owner, workspaceTwo, { name: "Other workspace", type: "CHECKING", currency: "USD" });

  return { active, archived: archivedRecord, ledger, outside, workspaces };
}

test("manual transaction account DTO mapping exposes only the selector fields", async () => {
  const { active, archived } = await fixture();

  assert.deepEqual(mapTransactionAccountOption(active), {
    id: active.id,
    name: "Everyday",
    currency: "XAF",
    type: "CHECKING",
  });
  assert.equal(mapTransactionAccountOption(archived), null);
});

test("manual transaction accounts are authorized, workspace-scoped, active, and empty when the workspace has none", async () => {
  const { active, ledger, outside, workspaces } = await fixture();

  const accounts = await getTransactionAccountOptions(
    { actor: owner, workspaceId: workspaceOne },
    { ledger, workspaces },
  );
  assert.deepEqual(accounts, [{ id: active.id, name: "Everyday", currency: "XAF", type: "CHECKING" }]);
  assert.equal(accounts.some((account) => account.id === outside.id), false);

  const zeroAccounts = await getTransactionAccountOptions(
    { actor: owner, workspaceId: zeroAccountWorkspace },
    { ledger, workspaces },
  );
  assert.deepEqual(zeroAccounts, []);
});

test("manual transaction account query rejects an unauthorized workspace before exposing options", async () => {
  const { ledger, workspaces } = await fixture();

  await assert.rejects(
    getTransactionAccountOptions({ actor: stranger, workspaceId: workspaceOne }, { ledger, workspaces }),
    AuthorizationError,
  );
});

test("a failed account query produces an explicit empty error state without fixtures", async () => {
  const state = await loadTransactionAccountOptions(async () => {
    throw new Error("database unavailable");
  });

  assert.deepEqual(state, failedTransactionAccountOptions());
  assert.deepEqual(state.accounts, []);
});
