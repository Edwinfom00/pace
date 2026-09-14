"use client";

import { useState } from "react";

import { AuthLanguageSwitcher } from "@/components/pace/auth/auth-language-switcher";
import { AuthTrustFooter } from "@/components/pace/auth/auth-trust-footer";
import { LoginForm } from "@/components/pace/auth/login-form";
import {
  getAuthFormTranslations,
  type AuthFormLanguage,
} from "@/i18n/messages";

type AuthFormPanelProps = {
  initialLanguage?: AuthFormLanguage;
  className?: string;
};

export function AuthFormPanel({
  initialLanguage = "en",
  className,
}: AuthFormPanelProps) {
  const [language, setLanguage] = useState<AuthFormLanguage>(initialLanguage);
  const t = getAuthFormTranslations(language);

  return (
    <section
      aria-labelledby="auth-form-title"
      className={[
        "flex min-h-[100dvh] w-full flex-col bg-white px-6 text-[#17213a] sm:px-10 lg:px-[clamp(2.75rem,5vw,6.5rem)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex min-h-20 items-center justify-end sm:min-h-24">
        <AuthLanguageSwitcher
          language={language}
          onLanguageChange={setLanguage}
          t={t}
        />
      </header>

      <main className="flex flex-1 items-center justify-center py-8 sm:py-10">
        <div className="w-full max-w-[31.75rem]">
          <div className="mb-9 sm:mb-10">
            <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.075em] text-[#73809a] uppercase">
              {t("auth.form.welcome")}
            </p>
            <h1
              className="text-[clamp(2.1rem,4.2vw,2.65rem)] leading-[1.08] font-[680] tracking-[-0.045em] text-[#101a2b]"
              id="auth-form-title"
            >
              {t("auth.form.title")}
            </h1>
            <p className="mt-2.5 max-w-[31rem] text-[0.98rem] leading-[1.55] text-[#61708d] sm:text-[1.02rem]">
              {t("auth.form.subtitle")}
            </p>
          </div>

          <LoginForm t={t} />
        </div>
      </main>

      <AuthTrustFooter
        helpLabel={t("auth.footer.help")}
        privacyLabel={t("auth.footer.privacy")}
        termsLabel={t("auth.footer.terms")}
        trustLabel={t("auth.form.trust")}
      />
    </section>
  );
}
