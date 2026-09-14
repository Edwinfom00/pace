import { FiArrowRight } from "react-icons/fi";

import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";

type OnboardingFooterProps = {
  language: OnboardingLanguage;
  onContinue: () => void;
  onBack?: () => void;
  submitting?: boolean;
  disabled?: boolean;
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
};

export function OnboardingFooter({
  language,
  onContinue,
  onBack,
  submitting = false,
  disabled = false,
  secondaryAction,
}: OnboardingFooterProps) {
  const t = getOnboardingTranslations(language);

  return (
    <footer className="mt-auto shrink-0 flex items-center gap-3 border-t border-[#dce4f0] pt-9 max-sm:sticky max-sm:bottom-0 max-sm:-mx-5 max-sm:mt-8 max-sm:bg-white/95 max-sm:px-5 max-sm:py-4 max-sm:backdrop-blur">
      <button
        className="h-14 min-w-32 rounded-xl bg-[#eef3fb] px-6 text-base font-semibold text-[#5871a1] transition-colors hover:bg-[#e4ecf8] disabled:cursor-not-allowed disabled:text-[#9aa9c1]"
        disabled={!onBack || submitting}
        onClick={onBack}
        type="button"
      >
        {t("onboarding.back")}
      </button>
      <div className="ml-auto flex items-center gap-3">
        {secondaryAction ? (
          <button
            className="min-h-11 px-3 text-[15px] font-medium text-[#62769a] underline decoration-[#aab8cc] underline-offset-4 transition-colors hover:text-[#1a3156] disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            disabled={submitting || secondaryAction.disabled}
            onClick={secondaryAction.onClick}
            type="button"
          >
            {secondaryAction.label}
          </button>
        ) : null}
        <button
          className="inline-flex h-14 min-w-44 items-center justify-center gap-3 rounded-xl bg-[#132442] px-7 text-base font-semibold text-white shadow-[0_10px_22px_rgba(19,36,66,0.14)] transition-transform hover:bg-[#1b3158] active:translate-y-px disabled:cursor-wait disabled:opacity-70"
          disabled={submitting || disabled}
          onClick={onContinue}
          type="button"
        >
          {submitting ? t("onboarding.continuing") : t("onboarding.continue")}
          {submitting ? null : <FiArrowRight aria-hidden className="size-5" />}
        </button>
      </div>
    </footer>
  );
}
