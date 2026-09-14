import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

import { cn } from "@/lib/utils";

const stepKeys = [
  ["onboarding.progress.yourPace.title", "onboarding.progress.yourPace.subtitle"],
  ["onboarding.progress.workspace.title", "onboarding.progress.workspace.subtitle"],
  ["onboarding.progress.together.title", "onboarding.progress.together.subtitle"],
  ["onboarding.progress.connect.title", "onboarding.progress.connect.subtitle"],
  ["onboarding.progress.preferences.title", "onboarding.progress.preferences.subtitle"],
] as const;

type OnboardingProgressProps = {
  step: OnboardingStep;
  language: OnboardingLanguage;
  compact?: boolean;
};

export function OnboardingProgress({ step, language, compact = false }: OnboardingProgressProps) {
  const t = getOnboardingTranslations(language);

  if (compact) {
    return (
      <div aria-label={t("onboarding.stepOf", { step })} className="flex items-center gap-1.5" role="progressbar" aria-valuemax={5} aria-valuemin={1} aria-valuenow={step}>
        {stepKeys.map((_, index) => (
          <span
            aria-hidden
            className={cn("h-1.5 w-6 rounded-full", index + 1 <= step ? "bg-[#3268ed]" : "bg-[#dfe7f4]")}
            key={index}
          />
        ))}
      </div>
    );
  }

  return (
    <ol aria-label={t("onboarding.stepOf", { step })} className="space-y-0">
      {stepKeys.map(([titleKey, subtitleKey], index) => {
        const stepNumber = (index + 1) as OnboardingStep;
        const current = step === stepNumber;

        return (
          <li className="relative grid grid-cols-[50px_1fr] gap-4 pb-3 last:pb-0" key={titleKey}>
            {index < stepKeys.length - 1 ? (
              <span aria-hidden className="absolute left-[24px] top-12 h-6 border-l-2 border-[#d5e0f2]" />
            ) : null}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "relative z-10 grid size-11 place-items-center rounded-full text-base font-semibold",
                current
                  ? "bg-[#3268ed] text-white shadow-[0_6px_18px_rgba(50,104,237,0.24)]"
                  : "bg-[#e8eef7] text-[#5e7196]",
              )}
            >
              {stepNumber}
            </span>
            <span className="pt-1.5">
              <span className={cn("block text-[17px] font-semibold leading-5", current ? "text-[#162647]" : "text-[#40597f]")}>{t(titleKey)}</span>
              <span className="mt-1 block text-sm leading-4 text-[#7488aa]">{t(subtitleKey)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
