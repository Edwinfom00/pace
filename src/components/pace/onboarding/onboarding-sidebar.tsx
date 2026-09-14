import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

import { OnboardingProgress } from "./onboarding-progress";
import { OnboardingVisual } from "./onboarding-visual";

type OnboardingSidebarProps = {
  step: OnboardingStep;
  language: OnboardingLanguage;
};

export function OnboardingSidebar({ step, language }: OnboardingSidebarProps) {
  const t = getOnboardingTranslations(language);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_13%_7%,rgba(255,255,255,0.92),transparent_27%),radial-gradient(circle_at_67%_42%,rgba(190,214,255,0.42),transparent_32%),linear-gradient(160deg,#e8f0ff_0%,#f8fbff_54%,#fff6ee_100%)] px-8 py-7 lg:px-12 lg:py-8">
      <PaceLogo height={45} preload width={150} />
      <div className="mt-8 lg:mt-9">
        <OnboardingProgress language={language} step={step} />
      </div>
      {step === 1 ? <OnboardingVisual step={step} /> : null}
      <div className="mt-auto max-w-[310px] pt-4">
        <h2 className="text-balance text-[22px] font-semibold tracking-[-0.04em] text-[#152340] lg:text-[26px]">{t("onboarding.sidebar.title")}</h2>
        <p className="mt-2 text-pretty text-[15px] leading-5 text-[#657da7]">{t("onboarding.sidebar.subtitle")}</p>
      </div>
    </aside>
  );
}
