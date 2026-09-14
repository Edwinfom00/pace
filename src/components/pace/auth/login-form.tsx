"use client";

import { useState } from "react";

import { HiOutlineArrowRight, HiOutlineEnvelope } from "react-icons/hi2";
import { FaApple, FaMicrosoft } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

import { AuthDivider } from "@/components/pace/auth/auth-divider";
import { AuthProviderButton } from "@/components/pace/auth/auth-provider-button";
import { PasswordField } from "@/components/pace/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAuthFormTranslations,
  type AuthFormLanguage,
} from "@/i18n/messages";

type LoginFormProps = {
  language: AuthFormLanguage;
  errors?: {
    email?: string;
    password?: string;
  };
};

type ValidationError = "invalid" | "required";

export function LoginForm({ errors, language }: LoginFormProps) {
  const emailErrorId = "auth-email-error";
  const [validationErrors, setValidationErrors] = useState<{
    email?: ValidationError;
    password?: ValidationError;
  }>({});
  const t = getAuthFormTranslations(language);
  const emailError = errors?.email ?? getValidationMessage(validationErrors.email, "email", t);
  const passwordError = errors?.password ?? getValidationMessage(validationErrors.password, "password", t);

  function validateForm(form: HTMLFormElement) {
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const nextErrors: typeof validationErrors = {};

    if (!email) {
      nextErrors.email = "required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "invalid";
    }

    if (!password) {
      nextErrors.password = "required";
    }

    setValidationErrors(nextErrors);
  }

  return (
    <form
      className="grid gap-6 [@media(max-height:850px)]:gap-4"
      noValidate
      onChange={(event) => {
        const fieldName = event.target instanceof HTMLInputElement ? event.target.name : undefined;

        if (fieldName === "email" || fieldName === "password") {
          setValidationErrors((currentErrors) => ({ ...currentErrors, [fieldName]: undefined }));
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        validateForm(event.currentTarget);
      }}
    >
      <div className="grid gap-5 [@media(max-height:850px)]:gap-3">
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
              aria-describedby={emailError ? emailErrorId : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              className="h-[3.25rem] rounded-[0.65rem] border-[#dbe2ec] bg-white pl-11 text-[0.92rem] text-[#17213a] placeholder:text-[#75819a] hover:border-[#cbd5e1] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/12 [@media(max-height:850px)]:h-11"
              id="auth-email"
              name="email"
              placeholder={t("auth.form.email.placeholder")}
              required
              type="email"
            />
          </div>
          <p
            aria-live="polite"
            className={emailError ? "text-[0.78rem] text-[#b42318]" : "sr-only"}
            id={emailErrorId}
          >
            {emailError}
          </p>
        </div>

        <PasswordField
          error={passwordError}
          forgotPasswordLabel={t("auth.form.forgotPassword")}
          hidePasswordLabel={t("auth.form.password.hide")}
          label={t("auth.form.password")}
          placeholder={t("auth.form.password.placeholder")}
          showPasswordLabel={t("auth.form.password.show")}
        />
      </div>

      <Button
        className="h-[3.3rem] rounded-[0.65rem] bg-[#101a2b] text-[0.92rem] font-medium text-white shadow-[0_7px_14px_rgb(18_32_55_/_12%)] transition-[background-color,transform,box-shadow] hover:bg-[#1c2940] active:translate-y-px focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/20 [@media(max-height:850px)]:h-11"
        type="submit"
      >
        {t("auth.form.signIn")}
        <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
      </Button>

      <div className="grid gap-5 pt-0.5 [@media(max-height:850px)]:gap-4">
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

      <div className="mt-1 grid justify-items-center gap-2 rounded-[0.7rem] border border-[#dfe5ee] px-5 py-5 text-center sm:py-[1.35rem] [@media(max-height:850px)]:py-4">
        <p className="text-[0.84rem] text-[#65718a]">{t("auth.form.noAccount")}</p>
        <span
          className="inline-flex items-center gap-1.5 text-[0.95rem] font-semibold text-[#1556e8]"
          data-auth-route="/register"
        >
          {t("auth.form.createAccount")}
          <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
        </span>
      </div>
    </form>
  );
}

function getValidationMessage(
  error: ValidationError | undefined,
  field: "email" | "password",
  t: ReturnType<typeof getAuthFormTranslations>,
) {
  if (!error) {
    return undefined;
  }

  if (field === "password") {
    return t("auth.form.password.required");
  }

  return error === "invalid"
    ? t("auth.form.email.invalid")
    : t("auth.form.email.required");
}
