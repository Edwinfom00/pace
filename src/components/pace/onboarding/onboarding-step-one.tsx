"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiInfo } from "react-icons/fi";

import { submitYourPaceStep } from "@/app/(auth)/onboarding/actions";
import { CountrySelect } from "@/components/pace/forms/country-select";
import { CurrencySelect } from "@/components/pace/forms/currency-select";
import { LanguageSelect } from "@/components/pace/forms/language-select";
import { TimezoneSelect } from "@/components/pace/forms/timezone-select";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import {
  getCountryDefaultCurrency,
  isSupportedCountry,
  isSupportedOnboardingLanguage,
  isSupportedTimezone,
  type OnboardingLanguage,
} from "@/modules/onboarding/metadata";
import { yourPaceSchema, type YourPaceDraft } from "@/modules/onboarding/profile-domain";
import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import {
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  useOnboardingStore,
} from "@/stores/onboarding-store";

import { OnboardingFooter } from "./onboarding-footer";
import { OnboardingSelectCard } from "./onboarding-select-card";
import { OnboardingShell } from "./onboarding-shell";

type StepOneProps = {
  initialSnapshot: OnboardingServerSnapshot;
};

type FormErrors = Partial<Record<keyof YourPaceDraft, string>>;

function detectBrowserDefaults(draft: YourPaceDraft): Partial<YourPaceDraft> {
  const languageCandidate = navigator.language.split("-")[0];
  const language = isSupportedOnboardingLanguage(languageCandidate) ? languageCandidate : undefined;
  const region = new Intl.Locale(navigator.language).region;
  const country = region && isSupportedCountry(region) ? region : undefined;
  const timezoneCandidate = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezone = timezoneCandidate && isSupportedTimezone(timezoneCandidate) ? timezoneCandidate : undefined;
  const currency = country ? getCountryDefaultCurrency(country) ?? undefined : undefined;

  return {
    country: draft.country || country,
    language: draft.language || language || "en",
    currency: draft.currency || currency,
    timezone: draft.timezone || timezone,
  };
}

export function OnboardingStepOne({ initialSnapshot }: StepOneProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState("");
  const [isPending, startTransition] = useTransition();
  const stored = useOnboardingStore();
  const displayed = ready
    ? stored
    : mergeOnboardingServerSnapshot(emptyOnboardingDraft, initialSnapshot);
  const language = displayed.yourPace.language as OnboardingLanguage;
  const t = useMemo(() => getOnboardingTranslations(language), [language]);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      await useOnboardingStore.persist.rehydrate();
      const store = useOnboardingStore.getState();
      store.hydrateFromServer(initialSnapshot);

      if (initialSnapshot.currentStep === 1) {
        store.setYourPace(detectBrowserDefaults(useOnboardingStore.getState().yourPace));
      }

      if (active) {
        setReady(true);
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [initialSnapshot]);

  function update(values: Partial<YourPaceDraft>) {
    useOnboardingStore.getState().setYourPace(values);
    setErrors((current) => {
      const next = { ...current };
      (Object.keys(values) as (keyof YourPaceDraft)[]).forEach((key) => delete next[key]);
      return next;
    });
    setServerError("");
  }

  function changeCountry(country: string) {
    const defaultCurrency = getCountryDefaultCurrency(country);
    update({ country, ...(defaultCurrency ? { currency: defaultCurrency } : {}) });
  }

  function continueOnboarding() {
    const draft = useOnboardingStore.getState().yourPace;
    const parsed = yourPaceSchema.safeParse(draft);

    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({
        country: fields.country?.[0] ? t("onboarding.validation.country") : undefined,
        language: fields.language?.[0] ? t("onboarding.validation.language") : undefined,
        currency: fields.currency?.[0] ? t("onboarding.validation.currency") : undefined,
        timezone: fields.timezone?.[0] ? t("onboarding.validation.timezone") : undefined,
      });
      return;
    }

    startTransition(async () => {
      const result = await submitYourPaceStep(parsed.data);
      if (!result.ok) {
        setErrors({
          country: result.errors.country ? t("onboarding.validation.country") : undefined,
          language: result.errors.language ? t("onboarding.validation.language") : undefined,
          currency: result.errors.currency ? t("onboarding.validation.currency") : undefined,
          timezone: result.errors.timezone ? t("onboarding.validation.timezone") : undefined,
        });
        setServerError(t("onboarding.validation.general"));
        return;
      }

      useOnboardingStore.getState().hydrateFromServer({
        currentStep: result.currentStep,
        yourPace: result.data,
      });
      router.push("/onboarding?step=2");
    });
  }

  return (
    <OnboardingShell
      eyebrow={t("onboarding.stepOf", { step: 1 })}
      footer={<OnboardingFooter disabled={!ready} language={language} onContinue={continueOnboarding} submitting={isPending} />}
      language={language}
      step={1}
      subtitle={t("onboarding.subtitle.yourPace")}
      title={t("onboarding.title.yourPace")}
    >
      <div className="grid grid-cols-1 gap-x-7 gap-y-8 sm:grid-cols-2 sm:gap-y-9">
        <OnboardingSelectCard error={errors.country} htmlFor="onboarding-country" label={t("onboarding.field.country")}>
          <CountrySelect
            ariaLabel={t("onboarding.field.country")}
            describedBy={errors.country ? "onboarding-country-error" : undefined}
            emptyLabel={t("onboarding.noResults")}
            invalid={Boolean(errors.country)}
            id="onboarding-country"
            language={language}
            onValueChange={changeCountry}
            placeholder={t("onboarding.select")}
            searchPlaceholder={t("onboarding.search.country")}
            value={displayed.yourPace.country}
          />
        </OnboardingSelectCard>
        <OnboardingSelectCard error={errors.language} htmlFor="onboarding-language" label={t("onboarding.field.language")}>
          <LanguageSelect
            ariaLabel={t("onboarding.field.language")}
            describedBy={errors.language ? "onboarding-language-error" : undefined}
            emptyLabel={t("onboarding.noResults")}
            invalid={Boolean(errors.language)}
            id="onboarding-language"
            onValueChange={(nextLanguage) => update({ language: nextLanguage })}
            placeholder={t("onboarding.select")}
            searchPlaceholder={t("onboarding.search.language")}
            value={language}
          />
        </OnboardingSelectCard>
        <OnboardingSelectCard error={errors.currency} htmlFor="onboarding-currency" label={t("onboarding.field.currency")}>
          <CurrencySelect
            ariaLabel={t("onboarding.field.currency")}
            describedBy={errors.currency ? "onboarding-currency-error" : undefined}
            emptyLabel={t("onboarding.noResults")}
            invalid={Boolean(errors.currency)}
            id="onboarding-currency"
            language={language}
            onValueChange={(currency) => update({ currency })}
            placeholder={t("onboarding.select")}
            searchPlaceholder={t("onboarding.search.currency")}
            value={displayed.yourPace.currency}
          />
        </OnboardingSelectCard>
        <OnboardingSelectCard error={errors.timezone} htmlFor="onboarding-timezone" label={t("onboarding.field.timezone")}>
          <TimezoneSelect
            ariaLabel={t("onboarding.field.timezone")}
            describedBy={errors.timezone ? "onboarding-timezone-error" : undefined}
            emptyLabel={t("onboarding.noResults")}
            invalid={Boolean(errors.timezone)}
            id="onboarding-timezone"
            onValueChange={(timezone) => update({ timezone })}
            placeholder={t("onboarding.select")}
            searchPlaceholder={t("onboarding.search.timezone")}
            value={displayed.yourPace.timezone}
          />
        </OnboardingSelectCard>
      </div>
      <div className="mt-12 flex max-w-3xl gap-3 text-[15px] leading-6 text-[#647ba5]">
        <FiInfo aria-hidden className="mt-0.5 size-5 shrink-0 text-[#5d76a6]" />
        <p>{t("onboarding.note")}</p>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-red-600">{serverError}</p>
    </OnboardingShell>
  );
}
