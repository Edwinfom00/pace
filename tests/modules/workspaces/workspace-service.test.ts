import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { AuthorizationError, ConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  INITIAL_WORKSPACE_ACCOUNT_NAME,
  LedgerService,
} from "@/modules/ledger/ledger-service";
import {
  PersonalWorkspaceInviteError,
  WorkspaceCannotBecomePersonalError,
  WorkspaceService,
} from "@/modules/workspaces/workspace-service";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import { InMemoryLedgerRepository } from "../../support/in-memory-ledger-repository";

const owner: AuthenticatedActor = {
  userId: "owner-1",
  email: "owner@pace.test",
  name: "Owner",
};

const invitee: AuthenticatedActor = {
  userId: "invitee-1",
  email: "invitee@pace.test",
  name: "Invitee",
};

async function createFixture() {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "unit-test-pepper");
  const workspace = await service.createWorkspace(owner, {
    name: "Shared home",
    type: "COUPLE",
    preferences: { currency: "XAF", timezone: "Africa/Douala" },
  });

  return { repository, service, workspace };
}

function accountsForWorkspace(repository: InMemoryWorkspaceRepository, workspaceId: string) {
  return [...repository.accounts.values()].filter((account) => account.workspaceId === workspaceId);
}

test("workspace creation assigns the authenticated creator as owner", async () => {
  const { repository, workspace } = await createFixture();
  const ownerMembership = await repository.findMembership(workspace.id, owner.userId);

  assert.equal(workspace.createdByUserId, owner.userId);
  assert.equal(ownerMembership?.role, "OWNER");
  assert.equal(repository.preferences.get(workspace.id)?.currency, "XAF");
});

test("every workspace type receives exactly one normal Main account in its workspace currency", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "unit-test-pepper");
  const specifications = [
    ["PERSONAL", "XAF"],
    ["COUPLE", "EUR"],
    ["FAMILY", "USD"],
    ["CUSTOM", "GBP"],
  ] as const;

  const created = [];
  for (const [type, currency] of specifications) {
    created.push(await service.createWorkspace(owner, {
      name: `${type} household`,
      type,
      preferences: { currency },
    }));
  }

  for (const [index, workspace] of created.entries()) {
    const [account] = accountsForWorkspace(repository, workspace.id);
    assert.equal(accountsForWorkspace(repository, workspace.id).length, 1);
    assert.equal(account?.name, INITIAL_WORKSPACE_ACCOUNT_NAME);
    assert.equal(account?.type, "CHECKING");
    assert.equal(account?.currency, specifications[index]?.[1]);
    assert.equal(account?.workspaceId, workspace.id);
    assert.equal(Object.hasOwn(account!, "isMain"), false);
    assert.equal(Object.hasOwn(account!, "isPrimary"), false);
  }

  assert.equal(new Set(repository.accounts.keys()).size, specifications.length);
});

test("a bootstrapped Main account starts at canonical zero without an opening-balance event", async () => {
  const { repository, workspace } = await createFixture();
  const [account] = accountsForWorkspace(repository, workspace.id);
  assert.ok(account);

  const ledgerRecords = new InMemoryLedgerRepository();
  ledgerRecords.accounts.set(account.id, account);
  const ledger = new LedgerService(ledgerRecords, repository);
  const balance = await ledger.getAccountBalance(owner, { workspaceId: workspace.id, accountId: account.id });

  assert.equal(balance.currentBalanceMinor, 0n);
  assert.equal(balance.availableBalanceMinor, 0n);
  assert.equal(balance.spendabilityMode, "ZERO_FLOOR");
  assert.equal(await ledgerRecords.findOpeningBalance(workspace.id, account.id), null);
  assert.equal(ledgerRecords.transactions.size, 0);
});

test("onboarding retries update the reserved workspace without duplicating its initial account", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "unit-test-pepper");
  const workspaceId = "onboarding-workspace-id";

  await service.createOrUpdateOnboardingWorkspace(owner, workspaceId, {
    name: "Our home",
    type: "COUPLE",
    preferences: { currency: "XAF" },
  });
  await service.createOrUpdateOnboardingWorkspace(owner, workspaceId, {
    name: "Our household",
    type: "FAMILY",
    preferences: { currency: "EUR" },
  });

  const [account] = accountsForWorkspace(repository, workspaceId);
  assert.equal(accountsForWorkspace(repository, workspaceId).length, 1);
  assert.equal(account?.name, INITIAL_WORKSPACE_ACCOUNT_NAME);
  assert.equal(account?.currency, "XAF");
  assert.equal(repository.workspaces.get(workspaceId)?.name, "Our household");
});

test("initial-account failure leaves no partially provisioned workspace", async () => {
  const repository = new InMemoryWorkspaceRepository();
  repository.failInitialAccountCreation = true;
  const service = new WorkspaceService(repository, "unit-test-pepper");

  await assert.rejects(
    service.createWorkspace(owner, { name: "Will not persist", type: "PERSONAL" }),
    /Initial account bootstrap failed/,
  );

  assert.equal(repository.workspaces.size, 0);
  assert.equal(repository.preferences.size, 0);
  assert.equal(repository.memberships.size, 0);
  assert.equal(repository.accounts.size, 0);
});

test("bootstrap accounts remain ordinary accounts that can be renamed and followed by manual accounts", async () => {
  const { repository, workspace } = await createFixture();
  const [initialAccount] = accountsForWorkspace(repository, workspace.id);
  assert.ok(initialAccount);

  const ledgerRecords = new InMemoryLedgerRepository();
  ledgerRecords.accounts.set(initialAccount.id, initialAccount);
  const ledger = new LedgerService(ledgerRecords, repository);
  const renamed = await ledger.manageAccount(owner, {
    workspaceId: workspace.id,
    accountId: initialAccount.id,
    action: "RENAME",
    name: "Household account",
    idempotencyKey: randomUUID(),
    expectedUpdatedAt: initialAccount.updatedAt,
  });
  const manual = await ledger.createAccount(owner, workspace.id, {
    name: "Savings",
    type: "SAVINGS",
    currency: "XAF",
  });

  assert.equal(renamed.name, "Household account");
  assert.equal(manual.name, "Savings");
  assert.equal((await ledger.listAccounts(owner, workspace.id)).length, 2);
});

test("pre-existing zero-account workspaces are not backfilled", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "unit-test-pepper");
  const now = new Date();
  repository.workspaces.set("legacy-workspace", {
    id: "legacy-workspace",
    name: "Legacy",
    slug: "legacy-workspace",
    type: "PERSONAL",
    createdByUserId: owner.userId,
    createdAt: now,
    updatedAt: now,
  });
  repository.preferences.set("legacy-workspace", {
    workspaceId: "legacy-workspace",
    currency: "USD",
    locale: "en-US",
    timezone: "UTC",
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  });
  repository.addMembership({
    workspaceId: "legacy-workspace",
    userId: owner.userId,
    role: "OWNER",
    invitedByUserId: null,
    joinedAt: now,
  });

  assert.equal((await service.getWorkspaceForMember(owner, "legacy-workspace"))?.id, "legacy-workspace");
  assert.equal(accountsForWorkspace(repository, "legacy-workspace").length, 0);
});

test("an administrator cannot use an invitation to escalate to administrator", async () => {
  const { repository, service, workspace } = await createFixture();
  repository.addMembership({
    workspaceId: workspace.id,
    userId: "admin-1",
    role: "ADMIN",
    invitedByUserId: owner.userId,
    joinedAt: new Date(),
  });

  await assert.rejects(
    service.createInvitation(
      { userId: "admin-1", email: "admin@pace.test", name: "Admin" },
      workspace.id,
      { email: invitee.email, role: "ADMIN", expiresInHours: 24 },
    ),
    AuthorizationError,
  );
});

test("a link invite is email-bound, single-use, and does not trust a supplied workspace id", async () => {
  const { repository, service, workspace } = await createFixture();
  const created = await service.createInvitation(owner, workspace.id, {
    email: invitee.email,
    role: "MEMBER",
    expiresInHours: 24,
  });

  const stored = repository.invitations.get(created.invitation.id);
  assert.ok(stored);
  assert.notEqual(stored.tokenHash, created.inviteUrlToken);
  assert.notEqual(stored.codeHash, created.shortCode.replaceAll("-", ""));

  await assert.rejects(
    service.joinInvitation(
      { userId: "wrong-user", email: "wrong@pace.test", name: "Wrong" },
      { token: created.inviteUrlToken },
    ),
    ConflictError,
  );

  const joined = await service.joinInvitation(invitee, { token: created.inviteUrlToken });
  assert.equal(joined.workspaceId, workspace.id);
  assert.equal((await repository.findMembership(workspace.id, invitee.userId))?.role, "MEMBER");

  const duplicate = await service.joinInvitation(invitee, { token: created.inviteUrlToken });
  assert.equal(duplicate.alreadyMember, true);
  assert.equal(repository.invitationAuditEvents.length, 1);
  assert.equal(accountsForWorkspace(repository, workspace.id).length, 1);
});

test("a short code creates the membership only for the recipient", async () => {
  const { repository, service, workspace } = await createFixture();
  const created = await service.createInvitation(owner, workspace.id, {
    email: invitee.email,
    role: "VIEWER",
    expiresInHours: 24,
  });

  const joined = await service.joinInvitation(invitee, { code: created.shortCode });
  assert.equal(joined.workspaceId, workspace.id);
  assert.equal((await repository.findMembership(workspace.id, invitee.userId))?.role, "VIEWER");
});

test("a revoked invitation cannot be joined", async () => {
  const { service, workspace } = await createFixture();
  const created = await service.createInvitation(owner, workspace.id, {
    email: invitee.email,
    role: "MEMBER",
    expiresInHours: 24,
  });

  await service.revokeInvitation(owner, workspace.id, created.invitation.id);
  await assert.rejects(
    service.joinInvitation(invitee, { code: created.shortCode }),
    ConflictError,
  );
});

test("personal workspaces reject invitation creation and do not accept a stale invitation", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "unit-test-pepper");
  const personal = await service.createWorkspace(owner, { name: "Only me", type: "PERSONAL" });

  await assert.rejects(
    service.createInvitation(owner, personal.id, {
      email: invitee.email,
      role: "MEMBER",
      expiresInHours: 24,
    }),
    PersonalWorkspaceInviteError,
  );

  const shared = await service.createWorkspace(owner, { name: "Temporary shared", type: "COUPLE" });
  const stale = await service.createInvitation(owner, shared.id, {
    email: invitee.email,
    role: "MEMBER",
    expiresInHours: 24,
  });
  repository.workspaces.set(shared.id, { ...shared, type: "PERSONAL" });

  await assert.rejects(
    service.joinInvitation(invitee, { token: stale.inviteUrlToken }),
    ConflictError,
  );
});

test("shareable invitation links are secure, generic, and still single-use", async () => {
  const { repository, service, workspace } = await createFixture();
  const created = await service.createInvitation(owner, workspace.id, {
    role: "MEMBER",
    expiresInHours: 24,
  });

  assert.equal(created.invitation.invitedEmail, null);
  const joined = await service.joinInvitation(
    { userId: "guest-1", email: "someone-else@pace.test", name: "Guest" },
    { code: created.shortCode },
  );
  assert.equal(joined.workspaceId, workspace.id);
  assert.equal((await repository.findMembership(workspace.id, "guest-1"))?.role, "MEMBER");

  await assert.rejects(
    service.joinInvitation(
      { userId: "guest-2", email: "another@pace.test", name: "Another" },
      { code: created.shortCode },
    ),
    ConflictError,
  );
});

test("a shared onboarding workspace cannot become personal while it has members or active invitations", async () => {
  const { repository, service, workspace } = await createFixture();
  const invitation = await service.createInvitation(owner, workspace.id, {
    email: invitee.email,
    role: "MEMBER",
    expiresInHours: 24,
  });

  await assert.rejects(
    service.createOrUpdateOnboardingWorkspace(owner, workspace.id, { name: workspace.name, type: "PERSONAL" }),
    WorkspaceCannotBecomePersonalError,
  );

  await service.revokeInvitation(owner, workspace.id, invitation.invitation.id);
  repository.addMembership({
    workspaceId: workspace.id,
    userId: invitee.userId,
    role: "MEMBER",
    invitedByUserId: owner.userId,
    joinedAt: new Date(),
  });

  await assert.rejects(
    service.createOrUpdateOnboardingWorkspace(owner, workspace.id, { name: workspace.name, type: "PERSONAL" }),
    WorkspaceCannotBecomePersonalError,
  );
});
