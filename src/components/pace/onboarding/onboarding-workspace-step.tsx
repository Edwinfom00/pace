"use client";

import { useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { FiHome, FiInfo, FiMoreHorizontal, FiUser, FiUsers } from "react-icons/fi";

import { submitWorkspaceStep } from "@/app/(auth)/onboarding/actions";
import { OnboardingFooter } from "@/components/pace/onboarding/onboarding-footer";
import { OnboardingShell } from "@/components/pace/onboarding/onboarding-shell";
import { PaceSelectionCard } from "@/components/pace/onboarding/pace-selection-card";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import {
  suggestedWorkspaceName,
  withSelectedWorkspaceType,
  workspaceStepSchema,
  type ValidatedWorkspaceStep,
} from "@/modules/onboarding/profile-domain";
import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { WORKSPACE_TYPES, type WorkspaceType } from "@/modules/workspaces/domain";
import {
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  useOnboardingStore,
} from "@/stores/onboarding-store";

type WorkspaceStepProps = {
  initialSnapshot: OnboardingServerSnapshot;
};

type FormErrors = Partial<Record<keyof ValidatedWorkspaceStep, string>>;

const workspaceOptions = [
  { value: "PERSONAL", icon: FiUser, titleKey: "onboarding.workspace.types.personal.title", descriptionKey: "onboarding.workspace.types.personal.description" },
  { value: "COUPLE", icon: FiUsers, titleKey: "onboarding.workspace.types.couple.title", descriptionKey: "onboarding.workspace.types.couple.description" },
  { value: "FAMILY", icon: FiHome, titleKey: "onboarding.workspace.types.family.title", descriptionKey: "onboarding.workspace.types.family.description" },
  { value: "CUSTOM", icon: FiMoreHorizontal, titleKey: "onboarding.workspace.types.custom.title", descriptionKey: "onboarding.workspace.types.custom.description" },
] as const satisfies ReadonlyArray<{
  value: WorkspaceType;
  icon: typeof FiUser;
  titleKey: "onboarding.workspace.types.personal.title" | "onboarding.workspace.types.couple.title" | "onboarding.workspace.types.family.title" | "onboarding.workspace.types.custom.title";
  descriptionKey: "onboarding.workspace.types.personal.description" | "onboarding.workspace.types.couple.description" | "onboarding.workspace.types.family.description" | "onboarding.workspace.types.custom.description";
}>;

function isWorkspaceType(value: string): value is WorkspaceType {
  return WORKSPACE_TYPES.some((type) => type === value);
}

export function OnboardingWorkspaceStep({ initialSnapshot }: WorkspaceStepProps) {
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

      const draft = useOnboardingStore.getState().workspace;
      if (!draft.type) {
        store.setWorkspace({ type: "COUPLE", name: suggestedWorkspaceName("COUPLE"), nameManuallyEdited: false });
      } else if (!draft.name && !draft.nameManuallyEdited) {
        store.setWorkspace({ name: suggestedWorkspaceName(draft.type), nameManuallyEdited: false });
      }

      if (active) setReady(true);
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [initialSnapshot]);

  function selectWorkspace(type: WorkspaceType) {
    const draft = useOnboardingStore.getState().workspace;
    useOnboardingStore.getState().setWorkspace(withSelectedWorkspaceType(draft, type));
    setErrors((current) => ({ ...current, type: undefined, name: undefined }));
    setServerError("");
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? workspaceOptions.length - 1 : (index + direction + workspaceOptions.length) % workspaceOptions.length;

    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const option = workspaceOptions[targetIndex];
    selectWorkspace(option.value);
    document.getElementById(`workspace-type-${option.value}`)?.focus();
  }

  function changeName(name: string) {
    useOnboardingStore.getState().setWorkspace({ name, nameManuallyEdited: true });
    setErrors((current) => ({ ...current, name: undefined }));
    setServerError("");
  }

  function continueOnboarding() {
    const draft = useOnboardingStore.getState().workspace;
    const parsed = workspaceStepSchema.safeParse({ type: draft.type, name: draft.name });

    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      setErrors({
        type: fields.type?.[0] ? t("onboarding.validation.workspaceType") : undefined,
        name: fields.name?.[0] ? t("onboarding.validation.workspaceName") : undefined,
      });
      return;
    }

    useOnboardingStore.getState().setWorkspace({ name: parsed.data.name, nameManuallyEdited: true });
    startTransition(async () => {
      const result = await submitWorkspaceStep(parsed.data);
      if (!result.ok) {
        setErrors({
          type: result.errors.type ? t("onboarding.validation.workspaceType") : undefined,
          name: result.errors.name ? t("onboarding.validation.workspaceName") : undefined,
        });
        setServerError(
          result.code === "WORKSPACE_CANNOT_BECOME_PERSONAL"
            ? t("onboarding.workspace.personalBlocked")
            : t("onboarding.validation.general"),
        );
        return;
      }

      const current = useOnboardingStore.getState();
      current.hydrateFromServer({
        currentStep: result.currentStep,
        yourPace: current.yourPace,
        workspace: { ...result.data, nameManuallyEdited: true },
        together: {
          skipped: result.data.type === "PERSONAL",
          hasExistingInvitation: false,
        },
        connect: current.connect.capabilities
          ? { ...current.connect, capabilities: current.connect.capabilities }
          : initialSnapshot.connect,
      });
      router.push(`/onboarding?step=${result.currentStep}`);
    });
  }

  const selectedType = isWorkspaceType(displayed.workspace.type) ? displayed.workspace.type : undefined;
  const describedBy = ["onboarding-workspace-name-help", errors.name ? "onboarding-workspace-name-error" : ""].filter(Boolean).join(" ");

  return (
    <OnboardingShell
      eyebrow={t("onboarding.workspace.eyebrow")}
      footer={<OnboardingFooter disabled={!ready} language={language} onBack={() => router.push("/onboarding?step=1")} onContinue={continueOnboarding} submitting={isPending} />}
      language={language}
      step={2}
      subtitle={t("onboarding.workspace.subtitle")}
      title={t("onboarding.workspace.title")}
    >
      <div aria-describedby={errors.type ? "onboarding-workspace-type-error" : undefined} aria-label={t("onboarding.workspace.title")} className="grid grid-cols-1 gap-5 sm:grid-cols-2" role="radiogroup">
        {workspaceOptions.map((option, index) => (
          <PaceSelectionCard
            description={t(option.descriptionKey)}
            icon={option.icon}
            id={`workspace-type-${option.value}`}
            key={option.value}
            onKeyDown={(event) => handleCardKeyDown(event, index)}
            onSelect={(value) => selectWorkspace(value as WorkspaceType)}
            selected={selectedType === option.value}
            title={t(option.titleKey)}
            value={option.value}
          />
        ))}
      </div>
      {errors.type ? <p aria-live="polite" className="mt-2 text-sm text-red-600" id="onboarding-workspace-type-error">{errors.type}</p> : null}

      <div className="mt-9 max-w-[920px]">
        <label className="mb-3 block text-[15px] font-semibold text-[#14223f]" htmlFor="onboarding-workspace-name">
          {t("onboarding.workspace.name.label")}
        </label>
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(errors.name)}
          className="h-15 w-full rounded-xl border border-[#d7e1f0] bg-white px-5 text-[18px] text-[#14223f] shadow-[0_2px_5px_rgba(28,57,108,0.02)] outline-none transition focus:border-[#3268ed] focus:ring-4 focus:ring-[#3268ed]/15 aria-invalid:border-red-500 aria-invalid:ring-red-100"
          id="onboarding-workspace-name"
          maxLength={120}
          onChange={(event) => changeName(event.target.value)}
          required
          value={displayed.workspace.name}
        />
        {errors.name ? <p aria-live="polite" className="mt-2 text-sm text-red-600" id="onboarding-workspace-name-error">{errors.name}</p> : null}
        <div className="mt-6 flex gap-3 text-[15px] leading-6 text-[#647baa]" id="onboarding-workspace-name-help">
          <FiInfo aria-hidden className="mt-0.5 size-5 shrink-0 text-[#5272ad]" />
          <p>{t("onboarding.workspace.name.helper")}</p>
        </div>
      </div>
      <p aria-live="polite" className="mt-3 text-sm text-red-600">{serverError}</p>
    </OnboardingShell>
  );
}
