import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";

import { ONBOARDING_STEPS, type OnboardingStep, type PaceUserProfileRecord } from "./profile-domain";
import type { WorkspaceType } from "../workspaces/domain";
import type { PaceUserProfileRepository } from "./repositories/pace-user-profile-repository";

export type OnboardingRouteResolution =
  | { kind: "redirect"; destination: string }
  | { kind: "render"; profile: PaceUserProfileRecord };

/** Keeps the route's server-authoritative access decision easy to test. */
export async function resolveOnboardingRoute(
  userId: string | null,
  profiles: PaceUserProfileRepository,
  resolveCompletedDestination: (userId: string) => Promise<string>,
): Promise<OnboardingRouteResolution> {
  if (!userId) {
    return { kind: "redirect", destination: loginPathForReturnTo("/onboarding") };
  }

  const profile = await profiles.getOrCreate(userId);

  if (profile.onboardingStatus === "COMPLETED") {
    return { kind: "redirect", destination: await resolveCompletedDestination(userId) };
  }

  return { kind: "render", profile };
}

/**
 * Completion is a server-owned high-water mark. The optional route step is
 * only the screen being reviewed, so Back never mutates persisted progress.
 */
export function resolveOnboardingViewedStep(
  requestedStep: string | undefined,
  completedStep: OnboardingStep,
): OnboardingStep {
  const candidate = Number(requestedStep);
  if (ONBOARDING_STEPS.includes(candidate as OnboardingStep) && candidate <= completedStep) {
    return candidate as OnboardingStep;
  }

  return completedStep;
}

/** PERSONAL workspaces skip Together server-side; Step 3 is never rendered. */
export function resolveOnboardingWorkspaceStep(
  step: OnboardingStep,
  workspaceType: WorkspaceType | undefined,
): OnboardingStep {
  return workspaceType === "PERSONAL" && step === 3 ? 4 : step;
}
