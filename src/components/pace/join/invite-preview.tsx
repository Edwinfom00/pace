"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineArrowRight, HiOutlineBuildingOffice2, HiOutlineUser } from "react-icons/hi2";

import { authRouteHref } from "@/components/pace/auth/auth-route";
import { Button } from "@/components/ui/button";
import { getJoinTranslations, type JoinLanguage } from "@/i18n/join-messages";
import type { JoinInvitationPreview } from "@/modules/workspaces/domain";

export type JoinCredential = { code: string } | { token: string };

type InvitePreviewProps = {
  credential: JoinCredential;
  language: JoinLanguage;
  onCancel?: () => void;
  preview: JoinInvitationPreview;
};

export function InvitePreview({ credential, language, onCancel, preview }: InvitePreviewProps) {
  const router = useRouter();
  const t = getJoinTranslations(language);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const workspace = preview.workspace;

  if (!workspace) return null;

  function cancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.replace("/join");
  }

  async function acceptInvite() {
    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/invitations/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(credential),
      });
      const data = (await response.json()) as {
        error?: string;
        membership?: { workspaceSlug: string };
      };

      if (response.status === 401) {
        const returnTo = "token" in credential ? `/join/${credential.token}` : "/join";
        router.push(authRouteHref("/login", language, returnTo));
        return;
      }

      if (!response.ok || !data.membership) {
        setError(data.error ?? t("join.status.invalid"));
        return;
      }

      router.replace(`/w/${data.membership.workspaceSlug}/overview`);
      router.refresh();
    } catch {
      setError(t("join.status.invalid"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="join-preview-title" className="grid gap-7 rounded-xl border border-[#dbe4f1] bg-white p-6 sm:p-8">
      <div className="grid gap-2">
        <p className="m-0 text-[0.7rem] font-semibold tracking-[0.075em] text-[#637cb3] uppercase">{t("join.preview.title")}</p>
        <h1 className="m-0 text-[clamp(2rem,4vw,2.7rem)] leading-[1.05] font-bold tracking-[-0.045em] text-[#101a2b]" id="join-preview-title">
          {workspace.name}
        </h1>
      </div>

      <dl className="grid gap-0 overflow-hidden rounded-[0.7rem] border border-[#e0e7f1]">
        <PreviewRow icon={HiOutlineBuildingOffice2} label={t("join.preview.workspaceType")} value={workspace.type} />
        <PreviewRow icon={HiOutlineUser} label={t("join.preview.invitedBy")} value={preview.invitedBy ?? "Pace"} />
        <PreviewRow icon={HiOutlineUser} label={t("join.preview.role")} value={preview.role ?? "MEMBER"} />
      </dl>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button className="h-[3.25rem] rounded-[0.65rem] border-[#d4ddeb] px-5 text-[#4a5872]" onClick={cancel} type="button" variant="outline">
          {t("join.preview.cancel")}
        </Button>
        <Button className="h-[3.25rem] rounded-[0.65rem] bg-[#101a2b] px-5 text-white hover:bg-[#1c2940]" disabled={isSubmitting} onClick={() => void acceptInvite()} type="button">
          {isSubmitting ? t("join.submitting") : t("join.preview.confirm", { workspace: workspace.name })}
          <HiOutlineArrowRight aria-hidden="true" className="size-5" />
        </Button>
      </div>
      <p aria-live="polite" className={error ? "text-center text-[0.82rem] text-[#b42318]" : "sr-only"}>{error}</p>
    </section>
  );
}

function PreviewRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof HiOutlineUser;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[#e8edf4] px-4 py-3.5 last:border-0 sm:px-5">
      <span className="grid size-8 place-items-center rounded-lg bg-[#edf3ff] text-[#1760f5]"><Icon aria-hidden="true" className="size-4" /></span>
      <div className="grid gap-0.5">
        <dt className="text-[0.73rem] font-medium text-[#75839b]">{label}</dt>
        <dd className="m-0 text-[0.9rem] font-semibold text-[#17213a]">{formatLabel(value)}</dd>
      </div>
    </div>
  );
}

function formatLabel(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
