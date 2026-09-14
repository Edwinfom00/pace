import assert from "node:assert/strict";
import test from "node:test";

import {
  getSafeInternalReturnTo,
  loginPathForReturnTo,
  ONBOARDING_DESTINATION,
  resolvePostAuthDestination,
  WORKSPACE_RECOVERY_DESTINATION,
  workspaceOverviewPath,
} from "@/modules/auth/post-auth-resolver";
import type { PaceUserProfileRecord } from "@/modules/onboarding/profile-domain";
import type { PaceUserProfileRepository } from "@/modules/onboarding/repositories/pace-user-profile-repository";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const actor = { userId: "user-1", email: "user@pace.test", name: "Pace User" };

function profile(status: PaceUserProfileRecord["onboardingStatus"]): PaceUserProfileRepository {
  return {
    async getOrCreate(userId) {
      return {
        userId,
        onboardingStatus: status,
        onboardingStep: status === "IN_PROGRESS" ? 2 : null,
        onboardingCompletedAt: status === "COMPLETED" ? new Date("2026-01-01") : null,
        countryCode: null,
        currency: null,
        timezone: null,
        onboardingWorkspaceId: null,
        onboardingSkippedSteps: [],
        onboardingInvitationId: null,
        onboardingStartingMethod: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
      };
    },
    async saveYourPaceStep() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async claimOnboardingWorkspaceId() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async saveWorkspaceStep() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async saveTogetherStep() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async saveConnectStep() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async claimOnboardingInvitationId() {
      throw new Error("Not used by post-auth resolver tests.");
    },
    async clearOnboardingInvitationId() {
      throw new Error("Not used by post-auth resolver tests.");
    },
  };
}

async function createWorkspaceFixture(user = actor) {
  const repository = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(repository, "test-pepper", () => "workspace-000000000001");
  const workspace = await service.createWorkspace(user, { name: "The Pace Home", type: "PERSONAL" });

  return { repository, workspace };
}

test("a new Pace user resolves to onboarding", async () => {
  const repository = new InMemoryWorkspaceRepository();

  const destination = await resolvePostAuthDestination(actor.userId, null, {
    profiles: profile("NOT_STARTED"),
    workspaces: repository,
  });

  assert.equal(destination, ONBOARDING_DESTINATION);
});

test("a user with onboarding in progress resolves to onboarding", async () => {
  const { repository } = await createWorkspaceFixture();

  const destination = await resolvePostAuthDestination(actor.userId, null, {
    profiles: profile("IN_PROGRESS"),
    workspaces: repository,
  });

  assert.equal(destination, ONBOARDING_DESTINATION);
});

test("a new user who came through an invite returns to that join route before onboarding", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const token = "a".repeat(43);

  const destination = await resolvePostAuthDestination(
    actor.userId,
    `/join/${token}?lang=de`,
    { profiles: profile("NOT_STARTED"), workspaces: repository },
  );

  assert.equal(destination, `/join/${token}?lang=de`);
});

test("a completed user resolves to their deterministic accessible workspace overview", async () => {
  const { repository, workspace } = await createWorkspaceFixture();

  const destination = await resolvePostAuthDestination(actor.userId, null, {
    profiles: profile("COMPLETED"),
    workspaces: repository,
  });

  assert.equal(destination, workspaceOverviewPath(workspace.slug));
});

test("an inaccessible workspace slug is never honored as a return destination", async () => {
  const { repository, workspace } = await createWorkspaceFixture();
  const otherWorkspace = await new WorkspaceService(
    repository,
    "test-pepper",
    () => "workspace-000000000002",
  ).createWorkspace(
    { userId: "other-user", email: "other@pace.test", name: "Other" },
    { name: "Private Workspace", type: "PERSONAL" },
  );

  assert.equal(await repository.findMemberContextBySlug(otherWorkspace.slug, actor.userId), null);

  const destination = await resolvePostAuthDestination(
    actor.userId,
    workspaceOverviewPath(otherWorkspace.slug),
    { profiles: profile("COMPLETED"), workspaces: repository },
  );

  assert.equal(destination, workspaceOverviewPath(workspace.slug));
});

test("a completed user without a membership receives the safe workspace recovery destination", async () => {
  const repository = new InMemoryWorkspaceRepository();

  const destination = await resolvePostAuthDestination(actor.userId, null, {
    profiles: profile("COMPLETED"),
    workspaces: repository,
  });

  assert.equal(destination, WORKSPACE_RECOVERY_DESTINATION);
});

test("workspace creation normalizes names, retries slug conflicts, and keeps stored slugs stable", async () => {
  const repository = new InMemoryWorkspaceRepository();
  const generatedIds = [
    "workspace-000000000001",
    "workspace-000000000001",
    "workspace-000000000002",
  ];
  const service = new WorkspaceService(repository, "test-pepper", () => {
    const next = generatedIds.shift();
    assert.ok(next);
    return next;
  });

  const first = await service.createWorkspace(actor, { name: "Café & Family", type: "FAMILY" });
  const second = await service.createWorkspace(actor, { name: "Café & Family", type: "FAMILY" });
  const renamed = { ...second, name: "Renamed workspace" };

  assert.match(first.slug, /^cafe-family-[a-z0-9]+$/);
  assert.notEqual(first.slug, second.slug);
  assert.equal(renamed.slug, second.slug);
});

test("destination route guards preserve only internal, authorized return URLs", async () => {
  const { repository, workspace } = await createWorkspaceFixture();

  assert.equal(getSafeInternalReturnTo("https://attacker.test"), null);
  assert.equal(getSafeInternalReturnTo("//attacker.test"), null);
  assert.equal(getSafeInternalReturnTo("/%2f%2fattacker.test"), null);
  assert.equal(loginPathForReturnTo("/onboarding"), "/login?returnTo=%2Fonboarding");

  const destination = await resolvePostAuthDestination(
    actor.userId,
    "https://attacker.test",
    { profiles: profile("COMPLETED"), workspaces: repository },
  );
  assert.equal(destination, workspaceOverviewPath(workspace.slug));
});
