import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingReadySummary } from "@/modules/onboarding/ready-summary";

import { OnboardingReadyScreen } from "./onboarding-ready-screen";


export function OnboardingReadyBoundary({
  language,
  summary,
}: {
  language: OnboardingLanguage;
  summary: OnboardingReadySummary;
}) {
  return <OnboardingReadyScreen language={language} summary={summary} />;
}
