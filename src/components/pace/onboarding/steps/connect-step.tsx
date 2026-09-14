"use client";

import { useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { FiCreditCard, FiEdit3, FiInfo, FiSmartphone, FiUpload } from "react-icons/fi";

import { submitConnectStep } from "@/app/(auth)/onboarding/actions";
import { OnboardingFooter } from "@/components/pace/onboarding/onboarding-footer";
import { OnboardingShell } from "@/components/pace/onboarding/onboarding-shell";
import { PaceSelectionCard } from "@/components/pace/onboarding/pace-selection-card";
import { getOnboardingTranslations, type OnboardingMessageKey } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import {
  isConnectionMethodAvailable,
  reconcileConnectionMethod,
  type OnboardingConnectionMethod,
} from "@/modules/onboarding/profile-domain";
import { resolveConnectBackStep } from "@/modules/onboarding/route-state";
import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import {
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  useOnboardingStore,
} from "@/stores/onboarding-store";

type ConnectStepProps = {
  initialSnapshot: OnboardingServerSnapshot;
};

type ConnectionOption = {
  value: OnboardingConnectionMethod;
  icon: typeof FiEdit3;
  titleKey: OnboardingMessageKey;
  descriptionKey: OnboardingMessageKey;
  badgeKey?: OnboardingMessageKey;
  comingSoonKey?: OnboardingMessageKey;
  featureKeys: readonly OnboardingMessageKey[];
};

const connectionOptions: readonly ConnectionOption[] = [
  {
    value: "MANUAL",
    icon: FiEdit3,
    titleKey: "onboarding.connect.manual.title",
    descriptionKey: "onboarding.connect.manual.description",
    badgeKey: "onboarding.connect.manual.badge",
    featureKeys: [
      "onboarding.connect.manual.features.quick",
      "onboarding.connect.manual.features.control",
      "onboarding.connect.manual.features.later",
    ],
  },
  {
    value: "IMPORT_STATEMENT",
    icon: FiUpload,
    titleKey: "onboarding.connect.import.title",
    descriptionKey: "onboarding.connect.import.description",
    featureKeys: [
      "onboarding.connect.import.features.history",
      "onboarding.connect.import.features.formats",
      "onboarding.connect.import.features.mapping",
    ],
  },
  {
    value: "BANK_CONNECTION",
    icon: FiCreditCard,
    titleKey: "onboarding.connect.bank.title",
    descriptionKey: "onboarding.connect.bank.description",
    comingSoonKey: "onboarding.connect.bank.comingSoon",
    featureKeys: [
      "onboarding.connect.bank.features.banks",
      "onboarding.connect.bank.features.secure",
      "onboarding.connect.bank.features.updates",
    ],
  },
  {
    value: "MOBILE_MONEY",
    icon: FiSmartphone,
    titleKey: "onboarding.connect.mobileMoney.title",
    descriptionKey: "onboarding.connect.mobileMoney.description",
    comingSoonKey: "onboarding.connect.mobileMoney.comingSoon",
    featureKeys: [
      "onboarding.connect.mobileMoney.features.providers",
      "onboarding.connect.mobileMoney.features.sync",
      "onboarding.connect.mobileMoney.features.notifications",
    ],
  },
];

export function OnboardingConnectStep({ initialSnapshot }: ConnectStepProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [serverError, setServerError] = useState("");
  const [isPending, startTransition] = useTransition();
  const stored = useOnboardingStore();
  const displayed = ready
    ? stored
    : mergeOnboardingServerSnapshot(emptyOnboardingDraft, initialSnapshot);
  const language = displayed.yourPace.language as OnboardingLanguage;
  const t = useMemo(() => getOnboardingTranslations(language), [language]);
  const capabilities = displayed.connect.capabilities;
  const selectedMethod = reconcileConnectionMethod(displayed.connect.selectedMethod, capabilities);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      await useOnboardingStore.persist.rehydrate();
      useOnboardingStore.getState().hydrateFromServer(initialSnapshot);
      if (active) setReady(true);
    }

    void hydrate();
    return () => { active = false; };
  }, [initialSnapshot]);

  function selectMethod(method: OnboardingConnectionMethod) {
    if (!isConnectionMethodAvailable(method, capabilities)) return;
    useOnboardingStore.getState().setConnect({ selectedMethod: method });
    setServerError("");
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, value: OnboardingConnectionMethod) {
    const enabled = connectionOptions.filter((option) => isConnectionMethodAvailable(option.value, capabilities));
    const currentIndex = enabled.findIndex((option) => option.value === value);
    if (currentIndex < 0) return;

    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabled.length - 1
        : (currentIndex + direction + enabled.length) % enabled.length;
    if (!direction && event.key !== "Home" && event.key !== "End") return;

    event.preventDefault();
    const target = enabled[targetIndex];
    if (!target) return;
    selectMethod(target.value);
    document.getElementById(`connection-method-${target.value}`)?.focus();
  }

  function continueOnboarding() {
    const method = reconcileConnectionMethod(useOnboardingStore.getState().connect.selectedMethod, capabilities);
    useOnboardingStore.getState().setConnect({ selectedMethod: method });
    setServerError("");

    startTransition(async () => {
      const result = await submitConnectStep(method);
      if (!result.ok) {
        setServerError(
          result.code === "CONNECTION_METHOD_UNAVAILABLE"
            ? t("onboarding.connect.unavailableError")
            : t("onboarding.connect.error"),
        );
        return;
      }

      useOnboardingStore.getState().setConnect({ selectedMethod: result.selectedMethod });
      useOnboardingStore.getState().setCurrentStep(result.currentStep);
      router.push(`/onboarding?step=${result.currentStep}`);
    });
  }

  return (
    <OnboardingShell
      eyebrow={t("onboarding.connect.eyebrow")}
      footer={
        <OnboardingFooter
          disabled={!ready}
          language={language}
          onBack={() => router.push(`/onboarding?step=${resolveConnectBackStep(initialSnapshot.workspace.type || undefined)}`)}
          onContinue={continueOnboarding}
          submitting={isPending}
        />
      }
      language={language}
      step={4}
      subtitle={t("onboarding.connect.subtitle")}
      title={t("onboarding.connect.title")}
    >
      <section aria-label={t("onboarding.connect.title")} className="max-w-[940px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" role="radiogroup">
          {connectionOptions.map((option) => {
            const available = isConnectionMethodAvailable(option.value, capabilities);
            const disabled = !available;
            const badge = option.badgeKey
              ? { label: t(option.badgeKey), tone: "recommended" as const }
              : option.comingSoonKey && disabled
                ? { label: t(option.comingSoonKey), tone: "comingSoon" as const }
                : undefined;

            return (
              <PaceSelectionCard
                badge={badge}
                description={t(option.descriptionKey)}
                disabled={disabled}
                features={option.featureKeys.map((key) => t(key))}
                icon={option.icon}
                id={`connection-method-${option.value}`}
                key={option.value}
                onKeyDown={(event) => handleCardKeyDown(event, option.value)}
                onSelect={() => selectMethod(option.value)}
                selected={selectedMethod === option.value && !disabled}
                selectedLabel={t("onboarding.connect.selected")}
                title={t(option.titleKey)}
                value={option.value}
              />
            );
          })}
        </div>

        <div className="mt-7 flex gap-3 rounded-xl bg-[#f1f6fd] px-5 py-4 text-[15px] leading-6 text-[#38527c]" role="note">
          <FiInfo aria-hidden className="mt-0.5 size-5 shrink-0 text-[#4f70a8]" />
          <p>{t("onboarding.connect.info")}</p>
        </div>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm text-red-600" role="status">{serverError}</p>
      </section>
    </OnboardingShell>
  );
}
