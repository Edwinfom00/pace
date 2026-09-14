import { redirect } from "next/navigation";

import { OnboardingReadyBoundary } from "@/components/pace/onboarding/onboarding-ready-boundary";
import { getPersistedOnboardingLanguage } from "@/i18n/server";
import { getAuthenticatedActor } from "@/authorization/session";
import { getPaceUserProfileRepository } from "@/modules/onboarding/server";


export default async function OnboardingReadyPage() {
  const actor = await getAuthenticatedActor();
  if (!actor) redirect("/login?returnTo=%2Fonboarding%2Fready");

  const profile = await getPaceUserProfileRepository().getOrCreate(actor.userId);
  if (profile.onboardingStatus !== "COMPLETED") redirect("/onboarding");

  const language = await getPersistedOnboardingLanguage(actor.userId);
  return <OnboardingReadyBoundary language={language} />;
}
