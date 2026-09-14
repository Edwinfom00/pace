import { redirect } from "next/navigation";

import { OnboardingReadyBoundary } from "@/components/pace/onboarding/onboarding-ready-boundary";
import { getPersistedOnboardingLanguage } from "@/i18n/server";
import { getAuthenticatedActor } from "@/authorization/session";
import { resolvePostAuthDestination } from "@/modules/auth/post-auth-resolver";
import { isOnboardingReady } from "@/modules/onboarding/profile-domain";
import { createOnboardingReadySummary } from "@/modules/onboarding/ready-summary";
import {
  getOnboardingMemberPreferences,
  getPaceUserProfileRepository,
} from "@/modules/onboarding/server";
import { getWorkspaceService } from "@/modules/workspaces/server";


export default async function OnboardingReadyPage() {
  const actor = await getAuthenticatedActor();
  if (!actor) redirect("/login?returnTo=%2Fonboarding%2Fready");

  const profile = await getPaceUserProfileRepository().getOrCreate(actor.userId);
  if (profile.onboardingStatus === "COMPLETED") {
    redirect(await resolvePostAuthDestination(actor.userId, null));
  }
  if (!isOnboardingReady(profile) || !profile.onboardingWorkspaceId) redirect("/onboarding");

  const language = await getPersistedOnboardingLanguage(actor.userId);
  const workspace = await getWorkspaceService().getWorkspaceForMember(actor, profile.onboardingWorkspaceId);
  const preferences = await getOnboardingMemberPreferences(workspace?.id ?? null, actor.userId);

  if (!workspace || !preferences) redirect("/onboarding");

  return (
    <OnboardingReadyBoundary
      language={language}
      summary={createOnboardingReadySummary(profile, workspace, preferences, language)}
    />
  );
}
