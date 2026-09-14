import { AuthBrandPanel } from "@/components/pace/auth/auth-brand-panel";
import { AuthFormPanel } from "@/components/pace/auth/auth-form-panel";
import type { AuthFormLanguage } from "@/i18n/messages";

type AuthShellProps = {
  language: AuthFormLanguage;
  mode?: "login" | "register";
  returnTo?: string | null;
};

export function AuthShell({
  language,
  mode = "login",
  returnTo,
}: AuthShellProps) {
  return (
    <main className="min-h-[100dvh] bg-[#f5f7fb] p-2 md:p-3 lg:p-4">
      <div className="grid min-h-[calc(100dvh-1rem)] overflow-hidden rounded-[1.125rem] border border-[#e3e8f1] bg-white md:h-[calc(100dvh-1.5rem)] md:min-h-0 md:grid-cols-[minmax(0,48fr)_minmax(0,52fr)] lg:h-[calc(100dvh-2rem)] xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <AuthBrandPanel
          className="hidden md:block"
          language={language}
        />
        <AuthFormPanel language={language} mode={mode} returnTo={returnTo} />
      </div>
    </main>
  );
}
