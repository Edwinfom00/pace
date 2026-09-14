"use client";

import { HiOutlineArrowRight, HiOutlineEnvelope } from "react-icons/hi2";
import { FaApple, FaMicrosoft } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

import { AuthDivider } from "@/components/pace/auth/auth-divider";
import { AuthProviderButton } from "@/components/pace/auth/auth-provider-button";
import { PasswordField } from "@/components/pace/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuthFormMessageKey } from "@/i18n/messages";

type LoginFormProps = {
  errors?: {
    email?: string;
    password?: string;
  };
  t: (key: AuthFormMessageKey) => string;
};

export function LoginForm({ errors, t }: LoginFormProps) {
  const emailErrorId = "auth-email-error";

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label className="text-[0.9rem] font-medium text-[#17213a]" htmlFor="auth-email">
            {t("auth.form.email")}
          </Label>
          <div className="relative">
            <HiOutlineEnvelope
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#52617c]"
            />
            <Input
              aria-describedby={errors?.email ? emailErrorId : undefined}
              aria-invalid={Boolean(errors?.email)}
              autoComplete="email"
              className="h-[3.25rem] rounded-[0.65rem] border-[#dbe2ec] bg-white pl-11 text-[0.92rem] text-[#17213a] placeholder:text-[#75819a] hover:border-[#cbd5e1] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/12"
              id="auth-email"
              name="email"
              placeholder={t("auth.form.email.placeholder")}
              required
              type="email"
            />
          </div>
          <p
            aria-live="polite"
            className={errors?.email ? "text-[0.78rem] text-[#b42318]" : "sr-only"}
            id={emailErrorId}
          >
            {errors?.email}
          </p>
        </div>

        <PasswordField
          error={errors?.password}
          forgotPasswordLabel={t("auth.form.forgotPassword")}
          forgotPasswordUrl="/forgot-password"
          hidePasswordLabel={t("auth.form.password.hide")}
          label={t("auth.form.password")}
          placeholder={t("auth.form.password.placeholder")}
          showPasswordLabel={t("auth.form.password.show")}
        />
      </div>

      <Button
        className="h-[3.3rem] rounded-[0.65rem] bg-[#101a2b] text-[0.92rem] font-medium text-white shadow-[0_7px_14px_rgb(18_32_55_/_12%)] transition-[background-color,transform,box-shadow] hover:bg-[#1c2940] active:translate-y-px focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/20"
        type="submit"
      >
        {t("auth.form.signIn")}
        <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
      </Button>

      <div className="grid gap-5 pt-0.5">
        <AuthDivider label={t("auth.form.continueWith")} />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <AuthProviderButton
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FcGoogle}
            label={t("auth.provider.google")}
          />
          <AuthProviderButton
            availability="coming-soon"
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FaApple}
            label={t("auth.provider.apple")}
          />
          <AuthProviderButton
            availability="coming-soon"
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FaMicrosoft}
            label={t("auth.provider.microsoft")}
          />
        </div>
      </div>

      <div className="mt-1 grid justify-items-center gap-2 rounded-[0.7rem] border border-[#dfe5ee] px-5 py-5 text-center sm:py-[1.35rem]">
        <p className="text-[0.84rem] text-[#65718a]">{t("auth.form.noAccount")}</p>
        <a
          className="inline-flex items-center gap-1.5 text-[0.95rem] font-semibold text-[#1556e8] transition-colors hover:text-[#0b3eae] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2360e8]/40"
          href="/register"
        >
          {t("auth.form.createAccount")}
          <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
        </a>
      </div>
    </form>
  );
}
