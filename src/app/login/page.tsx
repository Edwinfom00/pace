import { AuthShell } from "@/components/pace/auth/auth-shell";
import { toAuthFormLanguage } from "@/i18n/messages";

type LoginPageProps = {
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { lang } = await searchParams;

  return <AuthShell language={toAuthFormLanguage(lang)} />;
}
