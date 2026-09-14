import { getAuthenticatedActor } from "@/authorization/session";
import { JoinFormPanel } from "@/components/pace/join/join-form-panel";
import { JoinShell } from "@/components/pace/join/join-shell";
import type { JoinLanguage } from "@/i18n/join-messages";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";
import { redirect } from "next/navigation";

type JoinPageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const [{ lang }, actor] = await Promise.all([searchParams, getAuthenticatedActor()]);
  const language = toJoinLanguage(lang);


  if (!actor) {
    const query = language === "en" ? "" : `?lang=${language}`;
    redirect(loginPathForReturnTo(`/join${query}`));
  }

  return (
    <JoinShell language={language}>
      <JoinFormPanel actor={actor} language={language} />
    </JoinShell>
  );
}

function toJoinLanguage(value: string | string[] | undefined): JoinLanguage {
  return value === "fr" || value === "de" ? value : "en";
}
