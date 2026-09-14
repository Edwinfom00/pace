import { notFound, redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { InvitePreview } from "@/components/pace/join/invite-preview";
import { InviteStatus } from "@/components/pace/join/invite-status";
import { JoinShell } from "@/components/pace/join/join-shell";
import { getJoinTranslations, type JoinLanguage } from "@/i18n/join-messages";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { getWorkspaceService } from "@/modules/workspaces/server";

type JoinTokenPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export default async function JoinTokenPage({ params, searchParams }: JoinTokenPageProps) {
  const [{ token }, { lang }, actor] = await Promise.all([params, searchParams, getAuthenticatedActor()]);
  if (!INVITE_TOKEN_PATTERN.test(token)) notFound();

  const language = toJoinLanguage(lang);
  if (!actor) {
    const query = language === "en" ? "" : `?lang=${language}`;
    redirect(loginPathForReturnTo(`/join/${token}${query}`));
  }

  const preview = await getWorkspaceService().previewInvitation(actor, { token });
  const t = getJoinTranslations(language);

  return (
    <JoinShell language={language}>
      <div className="grid gap-8">
        <div>
          <p className="mb-3 text-[0.7rem] font-semibold tracking-[0.075em] text-[#637cb3] uppercase">{t("join.eyebrow")}</p>
          <h1 className="m-0 text-[clamp(2.2rem,4.5vw,3rem)] leading-[1.06] font-bold tracking-[-0.048em] text-[#101a2b]">{t("join.title")}</h1>
        </div>
        {preview.status === "VALID" ? (
          <InvitePreview credential={{ token }} language={language} preview={preview} />
        ) : (
          <InviteStatus language={language} preview={preview} />
        )}
      </div>
    </JoinShell>
  );
}

function toJoinLanguage(value: string | string[] | undefined): JoinLanguage {
  return value === "fr" || value === "de" ? value : "en";
}
