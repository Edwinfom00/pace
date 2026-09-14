"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineArrowRight, HiOutlineChevronRight, HiOutlineQuestionMarkCircle, HiOutlineQrCode } from "react-icons/hi2";

import { authRouteHref } from "@/components/pace/auth/auth-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJoinTranslations, type JoinLanguage } from "@/i18n/join-messages";
import { INVITE_CODE_LENGTH } from "@/modules/workspaces/invite-code";
import type { AuthenticatedActor } from "@/authorization/session";
import type { JoinInvitationPreview } from "@/modules/workspaces/domain";

import { PaceInviteCodeInput } from "./invite-code-input";
import { extractPaceInviteToken } from "./invite-link";
import { InvitePreview, type JoinCredential } from "./invite-preview";
import { InviteStatus } from "./invite-status";
import { InviteTabs } from "./invite-tabs";

type JoinFormPanelProps = {
  actor: AuthenticatedActor | null;
  language: JoinLanguage;
};

export function JoinFormPanel({ actor, language }: JoinFormPanelProps) {
  const router = useRouter();
  const t = getJoinTranslations(language);
  const [activeTab, setActiveTab] = useState<"code" | "link">("code");
  const [code, setCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [formError, setFormError] = useState<string>();
  const [isResolving, setIsResolving] = useState(false);
  const [preview, setPreview] = useState<JoinInvitationPreview>();
  const [credential, setCredential] = useState<JoinCredential>();

  function resetFlow() {
    setPreview(undefined);
    setCredential(undefined);
    setFormError(undefined);
  }

  async function resolveCode() {
    if (code.length !== INVITE_CODE_LENGTH) {
      setFormError(t("join.code.incomplete"));
      return;
    }
    if (!actor) {
      router.push(authRouteHref("/login", language, "/join"));
      return;
    }

    setFormError(undefined);
    setIsResolving(true);
    try {
      const response = await fetch("/api/invitations/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await response.json()) as { preview?: JoinInvitationPreview };

      if (response.status === 401) {
        router.push(authRouteHref("/login", language, "/join"));
        return;
      }
      if (response.status === 429) {
        setFormError(t("join.status.rateLimited"));
        return;
      }
      if (!response.ok || !data.preview) {
        setPreview({ status: "INVALID" });
        return;
      }

      setCredential({ code });
      setPreview(data.preview);
    } catch {
      setPreview({ status: "INVALID" });
    } finally {
      setIsResolving(false);
    }
  }

  function resolveLink() {
    const token = extractPaceInviteToken(inviteLink, window.location.origin);
    if (!token) {
      setFormError(t("join.link.invalid"));
      return;
    }

    const query = language === "en" ? "" : `?lang=${language}`;
    router.push(`/join/${token}${query}`);
  }

  if (preview && credential && preview.status === "VALID") {
    return <InvitePreview credential={credential} language={language} onCancel={resetFlow} preview={preview} />;
  }

  if (preview) {
    return <InviteStatus language={language} onDismiss={resetFlow} preview={preview} />;
  }

  return (
    <div>
      <div className="mb-9 sm:mb-10">
        <p className="mb-3 text-[0.7rem] font-semibold tracking-[0.075em] text-[#637cb3] uppercase">{t("join.eyebrow")}</p>
        <h1 className="m-0 text-[clamp(2.2rem,4.5vw,3rem)] leading-[1.06] font-bold tracking-[-0.048em] text-[#101a2b]">{t("join.title")}</h1>
        <p className="mt-3 max-w-[36rem] text-[clamp(1rem,1.7vw,1.2rem)] leading-[1.45] text-[#68799c]">{t("join.subtitle")}</p>
      </div>

      <section className="overflow-hidden rounded-xl border border-[#d9e2ef] bg-white" aria-label={t("join.eyebrow")}>
        <InviteTabs
          code={
            <div className="grid gap-5">
              <div className="grid gap-3">
                <label className="text-[0.94rem] font-semibold text-[#17213a]" htmlFor="pace-invite-code">{t("join.code.label")}</label>
                <PaceInviteCodeInput describedBy="join-code-helper" onChange={(next) => { setCode(next); setFormError(undefined); }} value={code} />
                <p className="m-0 text-[0.83rem] leading-5 text-[#7182a4]" id="join-code-helper">{t("join.code.helper")}</p>
              </div>
              <Button className="h-[3.4rem] rounded-[0.65rem] bg-[#101a2b] text-[0.95rem] text-white shadow-[0_7px_14px_rgb(18_32_55_/_12%)] hover:bg-[#1c2940]" disabled={code.length !== INVITE_CODE_LENGTH || isResolving} onClick={() => void resolveCode()} type="button">
                {isResolving ? t("join.submitting") : t("join.submit")}
                <HiOutlineArrowRight aria-hidden="true" className="size-5" />
              </Button>
              <button className="group flex items-center gap-4 rounded-[0.7rem] border border-transparent px-1 py-2 text-left outline-none hover:bg-[#f8faff] focus-visible:ring-3 focus-visible:ring-[#1760f5]/15" onClick={() => { setActiveTab("link"); setFormError(undefined); }} type="button">
                <span className="grid size-10 place-items-center rounded-lg bg-[#edf3ff] text-[#1760f5]"><HiOutlineQrCode aria-hidden="true" className="size-5" /></span>
                <span className="grid flex-1 gap-0.5"><strong className="text-[0.88rem] font-semibold text-[#17213a]">{t("join.alternative.title")}</strong><small className="text-[0.8rem] text-[#7080a1]">{t("join.alternative.description")}</small></span>
                <HiOutlineChevronRight aria-hidden="true" className="size-5 text-[#7181a1] transition group-hover:translate-x-0.5" />
              </button>
            </div>
          }
          codeLabel={t("join.tabs.code")}
          link={
            <div className="grid gap-5">
              <div className="grid gap-2.5">
                <label className="text-[0.94rem] font-semibold text-[#17213a]" htmlFor="join-invite-link">{t("join.link.label")}</label>
                <Input className="h-[3.4rem] rounded-[0.65rem] border-[#cad5e7] px-4 text-[0.92rem] placeholder:text-[#9aa7bd] focus-visible:border-[#1760f5] focus-visible:ring-4 focus-visible:ring-[#1760f5]/12" id="join-invite-link" onChange={(event) => { setInviteLink(event.target.value); setFormError(undefined); }} placeholder={t("join.link.placeholder")} type="url" value={inviteLink} />
              </div>
              <Button className="h-[3.4rem] rounded-[0.65rem] bg-[#101a2b] text-[0.95rem] text-white hover:bg-[#1c2940]" onClick={resolveLink} type="button">
                {t("join.submit")}
                <HiOutlineArrowRight aria-hidden="true" className="size-5" />
              </Button>
            </div>
          }
          linkLabel={t("join.tabs.link")}
          onValueChange={(next) => { setActiveTab(next); setFormError(undefined); }}
          value={activeTab}
        />
      </section>

      <p aria-live="polite" className={formError ? "mt-3 text-[0.82rem] text-[#b42318]" : "sr-only"}>{formError}</p>
      <div className="my-6 flex items-center gap-4 text-[0.76rem] font-semibold tracking-[0.075em] text-[#7181a1]"><span className="h-px flex-1 bg-[#dae3ef]" />{t("join.or")}<span className="h-px flex-1 bg-[#dae3ef]" /></div>
      <section className="flex items-start gap-4 rounded-[0.75rem] border border-[#dbe4f1] bg-[#fbfcff] px-5 py-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#edf3ff] text-[#1760f5]"><HiOutlineQuestionMarkCircle aria-hidden="true" className="size-5" /></span>
        <span className="grid gap-1"><strong className="text-[0.92rem] font-semibold text-[#17213a]">{t("join.help.title")}</strong><small className="text-[0.84rem] leading-5 text-[#7080a1]">{t("join.help.description")}</small></span>
      </section>
    </div>
  );
}
