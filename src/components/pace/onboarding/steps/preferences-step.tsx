"use client";

import { useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiCalendar,
  FiCreditCard,
  FiFeather,
  FiMoon,
  FiSend,
  FiSliders,
  FiStar,
  FiTarget,
  FiTrendingDown,
  FiUsers,
} from "react-icons/fi";

import { submitPreferencesStep } from "@/app/(auth)/onboarding/actions";
import { OnboardingFooter } from "@/components/pace/onboarding/onboarding-footer";
import { OnboardingShell } from "@/components/pace/onboarding/onboarding-shell";
import { PaceSelectionCard } from "@/components/pace/onboarding/pace-selection-card";
import { getOnboardingTranslations, type OnboardingMessageKey } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import {
  isPaceGoalAvailableInWorkspace,
  PACE_PROACTIVITY,
  type PaceGoal,
  type PaceProactivity,
} from "@/modules/onboarding/profile-domain";
import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import {
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  useOnboardingStore,
} from "@/stores/onboarding-store";

type PreferencesStepProps = {
  initialSnapshot: OnboardingServerSnapshot;
};

type PreferenceOption<T extends string> = {
  value: T;
  icon: IconType;
  tone: string;
  titleKey: OnboardingMessageKey;
  descriptionKey: OnboardingMessageKey;
};

const goalOptions: readonly PreferenceOption<PaceGoal>[] = [
  { value: "TRACK_SPENDING", icon: FiBarChart2, tone: "bg-[#eaf1ff] text-[#2f6cf4]", titleKey: "onboarding.preferences.goals.trackSpending.title", descriptionKey: "onboarding.preferences.goals.trackSpending.description" },
  { value: "SPEND_LESS", icon: FiTrendingDown, tone: "bg-[#e8f8f3] text-[#13a880]", titleKey: "onboarding.preferences.goals.spendLess.title", descriptionKey: "onboarding.preferences.goals.spendLess.description" },
  { value: "BILLS", icon: FiCalendar, tone: "bg-[#f3edff] text-[#8859ef]", titleKey: "onboarding.preferences.goals.bills.title", descriptionKey: "onboarding.preferences.goals.bills.description" },
  { value: "SUBSCRIPTIONS", icon: FiCreditCard, tone: "bg-[#fff0f5] text-[#e34a83]", titleKey: "onboarding.preferences.goals.subscriptions.title", descriptionKey: "onboarding.preferences.goals.subscriptions.description" },
  { value: "SAVE_FOR_SOMETHING", icon: FiTarget, tone: "bg-[#fff6e7] text-[#e89b22]", titleKey: "onboarding.preferences.goals.save.title", descriptionKey: "onboarding.preferences.goals.save.description" },
  { value: "MANAGE_TOGETHER", icon: FiUsers, tone: "bg-[#eaf2ff] text-[#437df3]", titleKey: "onboarding.preferences.goals.manageTogether.title", descriptionKey: "onboarding.preferences.goals.manageTogether.description" },
  { value: "BETTER_HABITS", icon: FiFeather, tone: "bg-[#e9f8f4] text-[#13ad86]", titleKey: "onboarding.preferences.goals.betterHabits.title", descriptionKey: "onboarding.preferences.goals.betterHabits.description" },
  { value: "STAY_ORGANIZED", icon: FiStar, tone: "bg-[#f3edff] text-[#8859ef]", titleKey: "onboarding.preferences.goals.organized.title", descriptionKey: "onboarding.preferences.goals.organized.description" },
];

const proactivityOptions: readonly PreferenceOption<PaceProactivity>[] = [
  { value: "QUIET", icon: FiMoon, tone: "bg-[#eef2fb] text-[#5e719c]", titleKey: "onboarding.preferences.proactivity.quiet.title", descriptionKey: "onboarding.preferences.proactivity.quiet.description" },
  { value: "BALANCED", icon: FiSliders, tone: "bg-[#eaf1ff] text-[#2f6cf4]", titleKey: "onboarding.preferences.proactivity.balanced.title", descriptionKey: "onboarding.preferences.proactivity.balanced.description" },
  { value: "PROACTIVE", icon: FiSend, tone: "bg-[#f3edff] text-[#8859ef]", titleKey: "onboarding.preferences.proactivity.proactive.title", descriptionKey: "onboarding.preferences.proactivity.proactive.description" },
];

export function OnboardingPreferencesStep({ initialSnapshot }: PreferencesStepProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const stored = useOnboardingStore();
  const displayed = ready
    ? stored
    : mergeOnboardingServerSnapshot(emptyOnboardingDraft, initialSnapshot);
  const language = displayed.yourPace.language as OnboardingLanguage;
  const t = useMemo(() => getOnboardingTranslations(language), [language]);
  const workspaceType = displayed.workspace.type;
  const availableGoals = useMemo(
    () => goalOptions.filter((option) => isPaceGoalAvailableInWorkspace(option.value, workspaceType)),
    [workspaceType],
  );
  const selectedGoals = displayed.preferences.goals.filter((goal) =>
    isPaceGoalAvailableInWorkspace(goal, workspaceType),
  );

  useEffect(() => {
    let active = true;

    async function hydrate() {
      await useOnboardingStore.persist.rehydrate();
      useOnboardingStore.getState().hydrateFromServer(initialSnapshot);
      const state = useOnboardingStore.getState();
      if (initialSnapshot.workspace.type === "PERSONAL" && state.preferences.goals.includes("MANAGE_TOGETHER")) {
        state.setPreferences({ goals: state.preferences.goals.filter((goal) => goal !== "MANAGE_TOGETHER") });
      }
      if (active) setReady(true);
    }

    void hydrate();
    return () => { active = false; };
  }, [initialSnapshot]);

  function toggleGoal(goal: PaceGoal) {
    if (!isPaceGoalAvailableInWorkspace(goal, workspaceType)) return;
    const current = useOnboardingStore.getState().preferences.goals;
    useOnboardingStore.getState().setPreferences({
      goals: current.includes(goal) ? current.filter((item) => item !== goal) : [...current, goal],
    });
    setError("");
  }

  function selectProactivity(proactivity: PaceProactivity) {
    useOnboardingStore.getState().setPreferences({ proactivity });
    setError("");
  }

  function handleProactivityKeyDown(event: KeyboardEvent<HTMLButtonElement>, value: PaceProactivity) {
    const index = PACE_PROACTIVITY.indexOf(value);
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? PACE_PROACTIVITY.length - 1
        : (index + direction + PACE_PROACTIVITY.length) % PACE_PROACTIVITY.length;
    if (!direction && event.key !== "Home" && event.key !== "End") return;

    event.preventDefault();
    const target = PACE_PROACTIVITY[targetIndex];
    if (!target) return;
    selectProactivity(target);
    document.getElementById(`pace-proactivity-${target}`)?.focus();
  }

  function continueOnboarding() {
    const preferences = useOnboardingStore.getState().preferences;
    if (preferences.goals.length === 0) {
      setError(t("onboarding.preferences.validation.goals"));
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await submitPreferencesStep(preferences);
      if (!result.ok) {
        setError(
          result.code === "VALIDATION_ERROR"
            ? t("onboarding.preferences.validation.goals")
            : result.code === "PERSONAL_WORKSPACE_GOAL_UNAVAILABLE"
              ? t("onboarding.preferences.validation.manageTogether")
              : t("onboarding.preferences.error"),
        );
        return;
      }

      useOnboardingStore.getState().setPreferences({ goals: result.goals, proactivity: result.proactivity });
      router.replace("/onboarding/ready");
    });
  }

  return (
    <OnboardingShell
      eyebrow={t("onboarding.preferences.eyebrow")}
      footer={
        <OnboardingFooter
          disabled={!ready}
          language={language}
          onBack={() => router.push("/onboarding?step=4")}
          onContinue={continueOnboarding}
          submitting={isPending}
        />
      }
      language={language}
      step={5}
      subtitle={t("onboarding.preferences.subtitle")}
      title={t("onboarding.preferences.title")}
    >
      <section aria-labelledby="pace-goals-heading" className="max-w-[950px]">
        <fieldset>
          <legend className="sr-only" id="pace-goals-heading">{t("onboarding.preferences.title")}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="group">
            {availableGoals.map((option) => (
              <PaceSelectionCard
                density="compact"
                description={t(option.descriptionKey)}
                icon={option.icon}
                iconClassName={option.tone}
                id={`pace-goal-${option.value}`}
                key={option.value}
                onSelect={() => toggleGoal(option.value)}
                selected={selectedGoals.includes(option.value)}
                selectedLabel={t("onboarding.preferences.selected")}
                selectionMode="multiple"
                title={t(option.titleKey)}
                value={option.value}
              />
            ))}
          </div>
        </fieldset>

        <div className="my-7 h-px bg-[#dce4f0] sm:my-8" />

        <fieldset aria-describedby="pace-proactivity-copy">
          <legend className="text-[19px] font-semibold tracking-[-0.025em] text-[#101e3b]">
            {t("onboarding.preferences.proactivity.title")}
          </legend>
          <p className="mt-1 text-[15px] leading-6 text-[#6077a2]" id="pace-proactivity-copy">
            {t("onboarding.preferences.proactivity.subtitle")}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup">
            {proactivityOptions.map((option) => (
              <PaceSelectionCard
                density="compact"
                description={t(option.descriptionKey)}
                icon={option.icon}
                iconClassName={option.tone}
                id={`pace-proactivity-${option.value}`}
                key={option.value}
                onKeyDown={(event) => handleProactivityKeyDown(event, option.value)}
                onSelect={() => selectProactivity(option.value)}
                selected={displayed.preferences.proactivity === option.value}
                selectedLabel={t("onboarding.preferences.selected")}
                title={t(option.titleKey)}
                value={option.value}
              />
            ))}
          </div>
        </fieldset>
        <p aria-live="polite" className="mt-3 min-h-5 text-sm text-red-600" role="status">{error}</p>
      </section>
    </OnboardingShell>
  );
}
