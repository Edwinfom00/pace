"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiArrowRight, FiCheck, FiLoader } from "react-icons/fi";

import { completeOnboardingReady } from "@/app/(auth)/onboarding/actions";
import { Button } from "@/components/ui/button";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingReadySummary } from "@/modules/onboarding/ready-summary";
import { useOnboardingStore } from "@/stores/onboarding-store";

import { OnboardingShell } from "./onboarding-shell";

type OnboardingReadyScreenProps = {
  language: OnboardingLanguage;
  summary: OnboardingReadySummary;
};

export function OnboardingReadyScreen({ language, summary }: OnboardingReadyScreenProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const t = useMemo(() => getOnboardingTranslations(language), [language]);
  const workspaceTypeKey = {
    PERSONAL: "onboarding.ready.workspaceTypes.personal",
    COUPLE: "onboarding.ready.workspaceTypes.couple",
    FAMILY: "onboarding.ready.workspaceTypes.family",
    CUSTOM: "onboarding.ready.workspaceTypes.custom",
  } as const;
  const guidanceKey = {
    QUIET: "onboarding.ready.guidanceValues.quiet",
    BALANCED: "onboarding.ready.guidanceValues.balanced",
    PROACTIVE: "onboarding.ready.guidanceValues.proactive",
  } as const;
  const startingMethodKey = {
    MANUAL: "onboarding.ready.startingMethods.manual",
    IMPORT_STATEMENT: "onboarding.ready.startingMethods.import_statement",
    BANK_CONNECTION: "onboarding.ready.startingMethods.bank_connection",
    MOBILE_MONEY: "onboarding.ready.startingMethods.mobile_money",
  } as const;

  const summaryItems = [
    { label: t("onboarding.ready.workspace"), value: summary.workspaceName },
    { label: t("onboarding.ready.countryCurrency"), value: summary.countryCurrency },
    { label: t("onboarding.ready.workspaceType"), value: t(workspaceTypeKey[summary.workspaceType]) },
    { label: t("onboarding.ready.guidance"), value: t(guidanceKey[summary.proactivity]) },
    { label: t("onboarding.ready.startingMethod"), value: t(startingMethodKey[summary.startingMethod]) },
  ];

  function openPace() {
    if (isPending) return;
    setError("");

    startTransition(async () => {
      const result = await completeOnboardingReady();
      if (!result.ok) {
        setError(t("onboarding.ready.error"));
        return;
      }

      // Finalization has succeeded at this point. Removing the client-only
      // draft cannot affect the canonical state the next route will render.
      useOnboardingStore.getState().reset();
      useOnboardingStore.persist.clearStorage();
      router.replace(result.destination);
    });
  }

  return (
    <OnboardingShell
      language={language}
      subtitle={t("onboarding.ready.subtitle")}
      title={t("onboarding.ready.title")}
      variant="ready"
    >
      <section aria-labelledby="pace-ready-summary" className="text-left">
        <div aria-hidden className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 mx-auto grid size-14 place-items-center rounded-full bg-[#e8f8ef] text-[#16865a] motion-safe:duration-300">
          <FiCheck className="size-7" />
        </div>

        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 mt-8 rounded-xl border border-[#dce5f1] bg-white p-5 motion-safe:duration-300 sm:p-6">
          <h2 className="sr-only" id="pace-ready-summary">{t("onboarding.ready.workspace")}</h2>
          <dl className="divide-y divide-[#e8edf5]">
            {summaryItems.map((item) => (
              <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_1fr] sm:gap-6" key={item.label}>
                <dt className="text-sm font-medium text-[#526a91]">{item.label}</dt>
                <dd className="text-[15px] font-semibold text-[#172847]">{item.value}</dd>
              </div>
            ))}
          </dl>
          {summary.invitationReady ? <p className="mt-5 text-sm text-[#526a91]">{t("onboarding.ready.invitationReady")}</p> : null}
        </div>

        <ul aria-label={t("onboarding.ready.title")} className="mt-7 grid gap-3 text-sm font-medium text-[#496384] sm:grid-cols-3">
          {[
            t("onboarding.ready.checklist.profile"),
            t("onboarding.ready.checklist.workspace"),
            t("onboarding.ready.checklist.pace"),
          ].map((item) => (
            <li className="motion-safe:animate-in motion-safe:fade-in flex items-center justify-center gap-2 motion-safe:duration-300" key={item}>
              <FiCheck aria-hidden className="size-4 text-[#16865a]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-9 text-center">
          <Button
            aria-describedby={error ? "pace-ready-error" : undefined}
            className="h-12 min-w-[11.5rem] rounded-xl bg-[#2f67e8] px-5 text-[15px] font-semibold text-white hover:bg-[#2559d7]"
            disabled={isPending}
            onClick={openPace}
            type="button"
          >
            {isPending ? <FiLoader aria-hidden className="size-4 motion-safe:animate-spin" /> : null}
            <span>{isPending ? t("onboarding.ready.openingPace") : t("onboarding.ready.openPace")}</span>
            {!isPending ? <FiArrowRight aria-hidden className="size-4" /> : null}
          </Button>
          <p aria-live="polite" className="mt-3 min-h-5 text-sm text-red-700" id="pace-ready-error" role="status">{error}</p>
        </div>
      </section>
    </OnboardingShell>
  );
}
