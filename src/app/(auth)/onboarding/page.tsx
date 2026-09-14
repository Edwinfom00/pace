import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { getPersistedOnboardingLanguage } from "@/i18n/server";
import {
  resolveOnboardingRoute,
  resolveOnboardingViewedStep,
  resolveOnboardingWorkspaceStep,
} from "@/modules/onboarding/route-state";
import { createOnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { getPaceUserProfileRepository } from "@/modules/onboarding/server";
import { resolvePostAuthDestination } from "@/modules/auth/post-auth-resolver";
import { getWorkspaceService } from "@/modules/workspaces/server";
import { OnboardingNextStepBoundary } from "@/components/pace/onboarding/onboarding-next-step-boundary";
import { OnboardingStepOne } from "@/components/pace/onboarding/onboarding-step-one";
import { OnboardingWorkspaceStep } from "@/components/pace/onboarding/onboarding-workspace-step";
import { OnboardingTogetherStep } from "@/components/pace/onboarding/steps/together-step";
import { OnboardingConnectStep } from "@/components/pace/onboarding/steps/connect-step";

type OnboardingPageProps = {
  searchParams: Promise<{ step?: string | string[] }>;
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
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
  const requestedStep = (await searchParams).step;
  const requestedViewedStep = resolveOnboardingViewedStep(
    Array.isArray(requestedStep) ? requestedStep[0] : requestedStep,
    (resolution.profile.onboardingStep ?? 1) as 1 | 2 | 3 | 4 | 5,
  );
  const workspace = actor && resolution.profile.onboardingWorkspaceId
    ? await getWorkspaceService().getWorkspaceForMember(actor, resolution.profile.onboardingWorkspaceId)
    : null;
  const viewedStep = resolveOnboardingWorkspaceStep(requestedViewedStep, workspace?.type);

  if (viewedStep !== requestedViewedStep) {
    redirect(`/onboarding?step=${viewedStep}`);
  }
  const snapshot = createOnboardingServerSnapshot(resolution.profile, language, workspace);

  if (viewedStep === 1) {
    return <OnboardingStepOne initialSnapshot={snapshot} />;
  }

  if (viewedStep === 2) {
    return <OnboardingWorkspaceStep initialSnapshot={snapshot} />;
  }

  if (viewedStep === 3) {
    return <OnboardingTogetherStep initialSnapshot={snapshot} />;
  }

  if (viewedStep === 4) {
    return <OnboardingConnectStep initialSnapshot={snapshot} />;
  }

  return <OnboardingNextStepBoundary language={language} step={viewedStep} />;
}
