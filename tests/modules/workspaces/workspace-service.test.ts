import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError, ConflictError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import {
  PersonalWorkspaceInviteError,
  WorkspaceCannotBecomePersonalError,
  WorkspaceService,
} from "@/modules/workspaces/workspace-service";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

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

test("workspace creation assigns the authenticated creator as owner", async () => {
  const { repository, workspace } = await createFixture();
  const ownerMembership = await repository.findMembership(workspace.id, owner.userId);

  assert.equal(workspace.createdByUserId, owner.userId);
  assert.equal(ownerMembership?.role, "OWNER");
  assert.equal(repository.preferences.get(workspace.id)?.currency, "XAF");
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
