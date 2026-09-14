import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedOnboardingLanguage } from "@/i18n/server";
import { resolveOnboardingRoute } from "@/modules/onboarding/route-state";
import { createOnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { getPaceUserProfileRepository } from "@/modules/onboarding/server";
import { resolvePostAuthDestination } from "@/modules/auth/post-auth-resolver";
import { OnboardingNextStepBoundary } from "@/components/pace/onboarding/onboarding-next-step-boundary";
import { OnboardingStepOne } from "@/components/pace/onboarding/onboarding-step-one";

export default async function OnboardingPage() {
  const actor = await getAuthenticatedActor();
  const resolution = await resolveOnboardingRoute(
    actor?.userId ?? null,
    getPaceUserProfileRepository(),
    (userId) => resolvePostAuthDestination(userId, null),
  );

  if (resolution.kind === "redirect") {
    redirect(resolution.destination);
  }

  const language = actor ? await getPersistedOnboardingLanguage(actor.userId) : "en";
  const snapshot = createOnboardingServerSnapshot(resolution.profile, language);

  if (snapshot.currentStep > 1) {
    return <OnboardingNextStepBoundary language={language} step={snapshot.currentStep} />;
  }

  return <OnboardingStepOne initialSnapshot={snapshot} />;
}
