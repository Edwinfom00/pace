import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

import { OnboardingShell } from "./onboarding-shell";

type OnboardingNextStepBoundaryProps = {
  language: OnboardingLanguage;
  step: OnboardingStep;
};


export function OnboardingNextStepBoundary({ language, step }: OnboardingNextStepBoundaryProps) {
  const t = getOnboardingTranslations(language);

  return (
    <OnboardingShell
      eyebrow={t("onboarding.stepOf", { step })}
      language={language}
      step={step}
      subtitle={t("onboarding.nextStep.subtitle")}
      title={t("onboarding.nextStep.title")}
    >
      <div className="h-px max-w-xl bg-[#dce4f0]" />
    </OnboardingShell>
  );
}
