import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";

import type { PaceUserProfileRecord } from "./profile-domain";
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
