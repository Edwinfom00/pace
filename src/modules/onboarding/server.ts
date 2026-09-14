import { DatabasePaceUserProfileRepository } from "./repositories/pace-user-profile-repository";
import { randomUUID } from "node:crypto";

import type { AuthenticatedActor } from "@/authorization/session";
import { getWorkspaceService } from "@/modules/workspaces/server";
import type { WorkspaceService } from "@/modules/workspaces/workspace-service";

import { workspaceStepSchema, yourPaceSchema, type PaceUserProfileRecord, type ValidatedWorkspaceStep } from "./profile-domain";
import type { PaceUserProfileRepository } from "./repositories/pace-user-profile-repository";

export function getPaceUserProfileRepository(): DatabasePaceUserProfileRepository {
  return new DatabasePaceUserProfileRepository();
}


export async function persistYourPaceStep(
  userId: string,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
): Promise<PaceUserProfileRecord> {
  const validated = yourPaceSchema.parse(input);
  return repository.saveYourPaceStep(userId, validated);
}

type WorkspaceOnboardingService = Pick<WorkspaceService, "createOrUpdateOnboardingWorkspace">;

export type PersistedWorkspaceStep = {
  data: ValidatedWorkspaceStep;
  profile: PaceUserProfileRecord;
};


export async function persistWorkspaceStep(
  actor: AuthenticatedActor,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
  workspaceService: WorkspaceOnboardingService = getWorkspaceService(),
): Promise<PersistedWorkspaceStep> {
  const data = workspaceStepSchema.parse(input);
  const reservedProfile = await repository.claimOnboardingWorkspaceId(actor.userId, randomUUID());

  if (!reservedProfile.onboardingWorkspaceId) {
    throw new Error("A workspace could not be reserved for onboarding.");
  }

  await workspaceService.createOrUpdateOnboardingWorkspace(
    actor,
    reservedProfile.onboardingWorkspaceId,
    data,
  );

  return {
    data,
    profile: await repository.saveWorkspaceStep(actor.userId, reservedProfile.onboardingWorkspaceId),
  };
}
