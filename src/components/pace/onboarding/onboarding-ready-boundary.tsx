import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

import { OnboardingShell } from "./onboarding-shell";


export function OnboardingReadyBoundary({ language }: { language: OnboardingLanguage }) {
  const t = getOnboardingTranslations(language);

  return (
    <OnboardingShell
      eyebrow={t("onboarding.preferences.eyebrow")}
      language={language}
      step={5}
      subtitle={t("onboarding.ready.subtitle")}
      title={t("onboarding.ready.title")}
    >
      <div className="h-px max-w-xl bg-[#dce4f0]" />
    </OnboardingShell>
  );
}
