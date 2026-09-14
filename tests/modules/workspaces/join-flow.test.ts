import assert from "node:assert/strict";
import test from "node:test";

import { RateLimitError } from "@/authorization/errors";
import { extractPaceInviteToken } from "@/components/pace/join/invite-link";
import { getJoinTranslations } from "@/i18n/join-messages";
import {
  assertManualInviteLookupAllowed,
  resetManualInviteLookupLimiterForTests,
} from "@/modules/workspaces/join-rate-limiter";
import {
  INVITE_CODE_LENGTH,
  isInvitationCode,
  normalizeInvitationCode,
} from "@/modules/workspaces/invite-code";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const owner = { userId: "owner", email: "owner@pace.test", name: "Edwin" };
const invitee = { userId: "invitee", email: "invitee@pace.test", name: "Pace User" };

async function fixture() {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "test-pepper");
  const workspace = await service.createWorkspace(owner, { name: "House", type: "COUPLE" });
  const invitation = await service.createInvitation(owner, workspace.id, {
    email: invitee.email,
    role: "MEMBER",
    expiresInHours: 24,
  });
  return { invitation, repository, service, workspace };
}

test("manual 4+4 input normalization accepts hyphenated, compact, and lowercase codes", () => {
  assert.equal(normalizeInvitationCode("k7px-4m2q"), "K7PX4M2Q");
  assert.equal(normalizeInvitationCode(" K7PX 4M2Q "), "K7PX4M2Q");
  assert.equal(INVITE_CODE_LENGTH, 8);
  assert.equal(isInvitationCode("K7PX4M2Q"), true);
  assert.equal(isInvitationCode("K7PX4M2"), false);
});

test("preview is safe, explicit acceptance is audited, and duplicate acceptance is idempotent", async () => {
  const { invitation, repository, service, workspace } = await fixture();

  const preview = await service.previewInvitation(invitee, { code: invitation.shortCode });
  assert.deepEqual(preview, {
    status: "VALID",
    workspace: { name: workspace.name, slug: workspace.slug, type: "COUPLE" },
    invitedBy: "A Pace member",
    role: "MEMBER",
  });
  assert.doesNotMatch(JSON.stringify(preview), /tokenHash|codeHash|workspaceId/i);

  const joined = await service.joinInvitation(invitee, { code: invitation.shortCode });
  assert.equal(joined.workspaceSlug, workspace.slug);
  assert.equal(joined.alreadyMember, false);
  assert.equal(repository.invitationAuditEvents.length, 1);

  const duplicate = await service.joinInvitation(invitee, { code: invitation.shortCode });
  assert.equal(duplicate.alreadyMember, true);
  assert.equal(repository.invitationAuditEvents.length, 1);
  assert.equal((await service.previewInvitation(invitee, { code: invitation.shortCode })).status, "ALREADY_MEMBER");
});

test("join preview distinguishes the safely handled domain states", async () => {
  const { invitation, repository, service, workspace } = await fixture();
  const stored = repository.invitations.get(invitation.invitation.id);
  assert.ok(stored);

  stored.revokedAt = new Date();
  assert.equal((await service.previewInvitation(invitee, { token: invitation.inviteUrlToken })).status, "REVOKED");

  stored.revokedAt = null;
  stored.expiresAt = new Date(Date.now() - 1);
  assert.equal((await service.previewInvitation(invitee, { token: invitation.inviteUrlToken })).status, "EXPIRED");

  repository.workspaces.set(workspace.id, { ...workspace, type: "PERSONAL" });
  assert.equal((await service.previewInvitation(invitee, { token: invitation.inviteUrlToken })).status, "PERSONAL_WORKSPACE_NOT_JOINABLE");
});

test("only same-origin Pace invitation URLs resolve to a token", () => {
  const token = "a".repeat(43);
  assert.equal(extractPaceInviteToken(`https://app.pace.test/join/${token}`, "https://app.pace.test"), token);
  assert.equal(extractPaceInviteToken(`https://attacker.test/join/${token}`, "https://app.pace.test"), null);
  assert.equal(extractPaceInviteToken("not a URL", "https://app.pace.test"), null);
});

test("manual code lookup is rate limited without storing the code", () => {
  resetManualInviteLookupLimiterForTests();
  for (let index = 0; index < 10; index += 1) {
    assert.doesNotThrow(() => assertManualInviteLookupAllowed("invitee", 1));
  }
  assert.throws(() => assertManualInviteLookupAllowed("invitee", 1), RateLimitError);
  resetManualInviteLookupLimiterForTests();
});

test("join copy is available in English, French, and German", () => {
  for (const language of ["en", "fr", "de"] as const) {
    const t = getJoinTranslations(language);
    assert.notEqual(t("join.title"), "");
    assert.notEqual(t("join.tabs.code"), "");
    assert.notEqual(t("join.status.personalNotJoinable"), "");
  }
});
