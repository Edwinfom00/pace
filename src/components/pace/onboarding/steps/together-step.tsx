"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FiClipboard, FiShield, FiUsers } from "react-icons/fi";

import {
  completeTogetherOnboarding,
  submitOnboardingInvitation,
} from "@/app/(auth)/onboarding/actions";
import { InviteEmailForm } from "@/components/pace/invites/invite-email-form";
import { InvitePermissionPreview } from "@/components/pace/invites/invite-permission-preview";
import { InviteSharePanel } from "@/components/pace/invites/invite-share-panel";
import { InviteTabs } from "@/components/pace/invites/invite-tabs";
import { OnboardingFooter } from "@/components/pace/onboarding/onboarding-footer";
import { OnboardingShell } from "@/components/pace/onboarding/onboarding-shell";
import { PaceCopyField } from "@/components/pace/shared/pace-copy-field";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingInviteMethod } from "@/modules/onboarding/profile-domain";
import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import {
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  useOnboardingStore,
} from "@/stores/onboarding-store";

type OnboardingTogetherStepProps = {
  initialSnapshot: OnboardingServerSnapshot;
};

type InviteCredentials = {
  shortCode: string;
  inviteLink: string;
};

export function OnboardingTogetherStep({ initialSnapshot }: OnboardingTogetherStepProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<"info" | "error">("info");
  const [credentials, setCredentials] = useState<InviteCredentials | null>(null);
  const [hasExistingInvitation, setHasExistingInvitation] = useState(initialSnapshot.together.hasExistingInvitation);
  const [isCreating, startCreateTransition] = useTransition();
  const [isCompleting, startCompleteTransition] = useTransition();
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
      if (active) setReady(true);
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [initialSnapshot]);

  function setMethod(method: OnboardingInviteMethod) {
    useOnboardingStore.getState().setTogether({ inviteMethod: method });
    setFeedback("");
    setFeedbackTone("info");
  }

  function createInvitation(method: OnboardingInviteMethod, email?: string, rotate = false) {
    setFeedback("");
    setFeedbackTone("info");
    startCreateTransition(async () => {
      const result = await submitOnboardingInvitation(
        method === "email" ? { method, email } : { method },
        { rotate },
      );

      if (!result.ok) {
        setFeedback(
          result.code === "ROTATION_REQUIRED"
            ? t("onboarding.together.rotationRequired")
            : result.code === "PERSONAL_WORKSPACE_CANNOT_INVITE"
              ? t("onboarding.together.personalError")
              : t("onboarding.together.error"),
        );
        setFeedbackTone("error");
        return;
      }

      // The raw token exists only in this ephemeral React state. It is never
      // copied into the persisted onboarding store or browser storage.
      setCredentials({
        shortCode: result.shortCode,
        inviteLink: new URL(`/join?token=${result.inviteUrlToken}`, window.location.origin).toString(),
      });
      setHasExistingInvitation(true);
      setFeedback(t("onboarding.together.created"));
      setFeedbackTone("info");
    });
  }

  function completeTogether() {
    setFeedback("");
    setFeedbackTone("info");
    startCompleteTransition(async () => {
      const result = await completeTogetherOnboarding();
      if (!result.ok) {
        setFeedback(t("onboarding.together.completeError"));
        setFeedbackTone("error");
        return;
      }

      useOnboardingStore.getState().setTogether({ skipped: result.skipped });
      useOnboardingStore.getState().setCurrentStep(result.currentStep);
      router.push(`/onboarding?step=${result.currentStep}`);
    });
  }

  const busy = isCreating || isCompleting;
  const needsRotation = hasExistingInvitation && !credentials;
  const method = displayed.together.inviteMethod;

  return (
    <OnboardingShell
      eyebrow={t("onboarding.together.eyebrow")}
      footer={
        <OnboardingFooter
          disabled={!ready || busy}
          language={language}
          onBack={() => router.push("/onboarding?step=2")}
          onContinue={completeTogether}
          secondaryAction={{ label: t("onboarding.together.skip"), onClick: completeTogether }}
          submitting={isCompleting}
        />
      }
      language={language}
      step={3}
      subtitle={t("onboarding.together.subtitle")}
      title={t("onboarding.together.title")}
    >
      <section className="max-w-[930px]">
        <div className="overflow-hidden rounded-xl border border-[#dbe3ef] bg-white">
          <InviteTabs
            emailContent={
              <InviteEmailForm
                createLabel={t("onboarding.together.createEmail")}
                disabled={!ready || busy}
                emailLabel={t("onboarding.together.email.label")}
                emailPlaceholder={t("onboarding.together.email.placeholder")}
                infoSubtitle={t("onboarding.together.info.subtitle")}
                infoTitle={t("onboarding.together.info.title")}
                invalidEmailLabel={t("onboarding.together.email.invalid")}
                onCreate={(email) => createInvitation("email", email, needsRotation)}
              />
            }
            emailLabel={t("onboarding.together.tabs.email")}
            linkContent={
              <InviteSharePanel
                description={t("onboarding.together.link.description")}
                disabled={!ready || busy}
                generateLabel={needsRotation ? t("onboarding.together.generateNewLink") : t("onboarding.together.generateLink")}
                onGenerate={() => createInvitation("link", undefined, needsRotation)}
              />
            }
            linkLabel={t("onboarding.together.tabs.link")}
            onValueChange={setMethod}
            value={method}
          />

          <div className="border-t border-[#e5ebf4] px-7 pb-7 pt-5 sm:px-8">
            <h2 className="text-[16px] font-semibold text-[#10203d]">{t("onboarding.together.permissions.title")}</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-0">
              <InvitePermissionPreview
                description={t("onboarding.together.permissions.shared.description")}
                icon={FiClipboard}
                title={t("onboarding.together.permissions.shared.title")}
              />
              <InvitePermissionPreview
                description={t("onboarding.together.permissions.safe.description")}
                icon={FiShield}
                title={t("onboarding.together.permissions.safe.title")}
              />
              <InvitePermissionPreview
                description={t("onboarding.together.permissions.team.description")}
                icon={FiUsers}
                title={t("onboarding.together.permissions.team.title")}
              />
            </div>
          </div>
        </div>

        <p aria-live="polite" className={`mt-3 min-h-5 text-sm ${feedbackTone === "error" ? "text-red-600" : "text-[#476494]"}`} role="status">
          {feedback}
        </p>

        {credentials ? (
          <>
            <div className="my-5 flex items-center gap-5 text-xs font-medium tracking-[0.08em] text-[#7084a6]">
              <span aria-hidden className="h-px flex-1 bg-[#dce5f1]" />
              <span>{t("onboarding.together.or")}</span>
              <span aria-hidden className="h-px flex-1 bg-[#dce5f1]" />
            </div>
            <section className="rounded-xl border border-[#dbe3ef] bg-white px-7 py-6 sm:px-8" aria-label={t("onboarding.together.tabs.link")}>
              <div className="grid gap-5 md:grid-cols-2 md:gap-7">
                <PaceCopyField
                  copiedLabel={t("onboarding.together.copied")}
                  copyErrorLabel={t("onboarding.together.copyError")}
                  copyLabel={t("onboarding.together.copy")}
                  label={t("onboarding.together.code")}
                  value={credentials.shortCode}
                />
                <PaceCopyField
                  copiedLabel={t("onboarding.together.copied")}
                  copyErrorLabel={t("onboarding.together.copyError")}
                  copyLabel={t("onboarding.together.copy")}
                  label={t("onboarding.together.link")}
                  value={credentials.inviteLink}
                />
              </div>
            </section>
          </>
        ) : null}
      </section>
    </OnboardingShell>
  );
}
