import { AuthLanguageSwitcher } from "@/components/pace/auth/auth-language-switcher";
import { AuthTrustFooter } from "@/components/pace/auth/auth-trust-footer";
import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { LoginForm } from "@/components/pace/auth/login-form";
import { RegisterForm } from "@/components/pace/auth/register-form";
import {
  getAuthFormTranslations,
  type AuthFormLanguage,
} from "@/i18n/messages";

type AuthFormPanelProps = {
  language?: AuthFormLanguage;
  className?: string;
  mode?: "login" | "register";
  returnTo?: string | null;
};

export function AuthFormPanel({
  language = "en",
  className,
  mode = "login",
  returnTo,
}: AuthFormPanelProps) {
  const t = getAuthFormTranslations(language);
  const isRegister = mode === "register";

  return (
    <section
      aria-labelledby="auth-form-title"
      className={[
        "flex h-full min-h-0 w-full flex-col bg-white px-6 text-[#17213a] sm:px-10 lg:px-[clamp(2.75rem,5vw,6.5rem)]",
        isRegister
          ? "overflow-visible md:overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex min-h-20 shrink-0 items-center justify-between sm:min-h-24 [@media(max-height:850px)]:min-h-16">
        <PaceLogo className="md:hidden" height={32} width={107} />
        <AuthLanguageSwitcher language={language} />
      </header>

      <div
        className={
          isRegister
            ? "flex w-full justify-center pb-8 pt-8 sm:pt-10 md:pb-10"
            : "flex min-h-0 flex-1 items-start justify-center pb-8 pt-10 sm:pb-10 sm:pt-[clamp(2.75rem,4.5vh,3.75rem)] [@media(max-height:850px)]:pb-4 [@media(max-height:850px)]:pt-5"
        }
      >
        <div className="w-full max-w-[31.75rem]">
          <div className="mb-9 sm:mb-10 [@media(max-height:850px)]:mb-6">
            <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.075em] text-[#73809a] uppercase [@media(max-height:850px)]:mb-2">
              {t(isRegister ? "auth.register.welcome" : "auth.form.welcome")}
            </p>
            <h1
              className="text-[clamp(2.1rem,4.2vw,2.65rem)] leading-[1.08] font-bold tracking-[-0.035em] text-[#101a2b] [@media(max-height:850px)]:text-[2.25rem]"
              id="auth-form-title"
            >
              {t(isRegister ? "auth.register.title" : "auth.form.title")}
            </h1>
            <p className="mt-2.5 max-w-[31rem] text-[0.98rem] leading-[1.55] text-[#61708d] sm:text-[1.02rem] [@media(max-height:850px)]:mt-2 [@media(max-height:850px)]:text-[0.94rem]">
              {t(isRegister ? "auth.register.subtitle" : "auth.form.subtitle")}
            </p>
          </div>

          {isRegister ? (
            <RegisterForm language={language} returnTo={returnTo} />
          ) : (
            <LoginForm language={language} returnTo={returnTo} />
          )}
        </div>
      </div>

      {!isRegister ? (
        <AuthTrustFooter
          helpLabel={t("auth.footer.help")}
          privacyLabel={t("auth.footer.privacy")}
          termsLabel={t("auth.footer.terms")}
          trustLabel={t("auth.form.trust")}
        />
      ) : null}
    </section>
  );
}
