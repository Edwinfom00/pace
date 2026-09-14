import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { AuthShell } from "@/components/pace/auth/auth-shell";
import { toAuthFormLanguage } from "@/i18n/messages";
import { resolvePostAuthDestination } from "@/modules/auth/post-auth-resolver";

type LoginPageProps = {
  searchParams: Promise<{ lang?: string | string[]; returnTo?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { lang, returnTo } = await searchParams;
  const actor = await getAuthenticatedActor();
  const safeReturnTo = typeof returnTo === "string" ? returnTo : null;

  if (actor) {
    redirect(await resolvePostAuthDestination(actor.userId, safeReturnTo));
  }

  return <AuthShell language={toAuthFormLanguage(lang)} returnTo={safeReturnTo} />;
}
