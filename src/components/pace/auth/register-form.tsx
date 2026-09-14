"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  HiOutlineArrowRight,
  HiCheckCircle,
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlineUser,
} from "react-icons/hi2";
import { FaApple, FaMicrosoft } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

import { AuthDivider } from "@/components/pace/auth/auth-divider";
import { AuthProviderButton } from "@/components/pace/auth/auth-provider-button";
import { authRouteHref } from "@/components/pace/auth/auth-route";
import { PasswordField } from "@/components/pace/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAuthFormTranslations,
  type AuthFormLanguage,
} from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

type RegisterFormProps = {
  language: AuthFormLanguage;
  returnTo?: string | null;
};

type ValidationErrors = {
  email?: "invalid" | "required";
  fullName?: "required";
  password?: "required" | "tooShort";
  passwordConfirmation?: "mismatch" | "required";
};

export function RegisterForm({ language, returnTo }: RegisterFormProps) {
  const t = getAuthFormTranslations(language);
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasStartedPassword, setHasStartedPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const passwordRequirements = {
    hasLetterAndNumber: /[a-z]/i.test(passwordValue) && /\d/.test(passwordValue),
    hasMinimumLength: passwordValue.length >= 12,
    hasSpecialCharacter: /[^a-z\d]/i.test(passwordValue),
  };
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const fullNameError = validationErrors.fullName
    ? t("auth.register.fullName.required")
    : undefined;
  const emailError = getEmailError(validationErrors.email, t);
  const passwordError = getPasswordError(validationErrors.password, t);
  const passwordConfirmationError = getPasswordConfirmationError(
    validationErrors.passwordConfirmation,
    t,
  );

  async function submitForm(form: HTMLFormElement) {
    const formData = new FormData(form);
    const fullName = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
    const nextErrors: ValidationErrors = {};

    if (!fullName) {
      nextErrors.fullName = "required";
    }

    if (!email) {
      nextErrors.email = "required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "invalid";
    }

    if (!password) {
      nextErrors.password = "required";
    } else if (password.length < 12) {
      nextErrors.password = "tooShort";
    }

    if (!passwordConfirmation) {
      nextErrors.passwordConfirmation = "required";
    } else if (password !== passwordConfirmation) {
      nextErrors.passwordConfirmation = "mismatch";
    }

    setValidationErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitError(undefined);
    setIsSubmitting(true);

    try {
      const result = await authClient.signUp.email({
        email,
        name: fullName,
        password,
      });

      if (result.error) {
        setSubmitError(result.error.message || t("auth.register.createAccount.error"));
        return;
      }

      // The server-only resolver on /login creates the Pace profile and chooses
      // the secure destination after Better Auth has established the session.
      router.replace(authRouteHref("/login", language, returnTo));
      router.refresh();
    } catch {
      setSubmitError(t("auth.register.createAccount.error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-5 [@media(max-height:850px)]:gap-4"
      noValidate
      onChange={(event) => {
        const input = event.target instanceof HTMLInputElement ? event.target : null;
        const fieldName = input?.name;

        if (
          fieldName === "name" ||
          fieldName === "email" ||
          fieldName === "password" ||
          fieldName === "passwordConfirmation"
        ) {
          setValidationErrors((currentErrors) => ({
            ...clearValidationError(currentErrors, fieldName),
            ...(fieldName === "password"
              ? { passwordConfirmation: undefined }
              : undefined),
          }));

          if (fieldName === "password") {
            setHasStartedPassword(true);
            setPasswordValue(input?.value ?? "");
          }
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void submitForm(event.currentTarget);
      }}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <AuthProviderButton
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FcGoogle}
            label={t("auth.provider.google")}
            layout="inline"
          />
          <AuthProviderButton
            availability="coming-soon"
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FaApple}
            label={t("auth.provider.apple")}
            layout="inline"
          />
          <AuthProviderButton
            availability="coming-soon"
            className="sm:col-span-2"
            comingSoonLabel={t("auth.provider.comingSoon")}
            icon={FaMicrosoft}
            label={t("auth.provider.microsoft")}
            layout="inline"
          />
        </div>
        <AuthDivider label={t("auth.form.continueWith")} />
      </div>

      <div className="grid gap-3.5 [@media(max-height:850px)]:gap-3">
        <div className="grid gap-2">
          <Label className="text-[0.9rem] font-medium text-[#17213a]" htmlFor="auth-name">
            {t("auth.register.fullName")}
          </Label>
          <div className="relative">
            <HiOutlineUser
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#52617c]"
            />
            <Input
              aria-describedby={fullNameError ? "auth-name-error" : undefined}
              aria-invalid={Boolean(fullNameError)}
              autoComplete="name"
              className="h-12 rounded-[0.65rem] border-[#dbe2ec] bg-white pl-11 text-[0.92rem] text-[#17213a] placeholder:text-[#75819a] hover:border-[#cbd5e1] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/12"
              id="auth-name"
              name="name"
              placeholder={t("auth.register.fullName.placeholder")}
              required
              type="text"
            />
          </div>
          <p
            aria-live="polite"
            className={fullNameError ? "text-[0.78rem] text-[#b42318]" : "sr-only"}
            id="auth-name-error"
          >
            {fullNameError}
          </p>
        </div>

        <div className="grid gap-2">
          <Label className="text-[0.9rem] font-medium text-[#17213a]" htmlFor="auth-register-email">
            {t("auth.form.email")}
          </Label>
          <div className="relative">
            <HiOutlineEnvelope
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#52617c]"
            />
            <Input
              aria-describedby={emailError ? "auth-register-email-error" : undefined}
              aria-invalid={Boolean(emailError)}
              autoComplete="email"
              className="h-12 rounded-[0.65rem] border-[#dbe2ec] bg-white pl-11 text-[0.92rem] text-[#17213a] placeholder:text-[#75819a] hover:border-[#cbd5e1] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/12"
              id="auth-register-email"
              name="email"
              placeholder={t("auth.form.email.placeholder")}
              required
              type="email"
            />
          </div>
          <p
            aria-live="polite"
            className={emailError ? "text-[0.78rem] text-[#b42318]" : "sr-only"}
            id="auth-register-email-error"
          >
            {emailError}
          </p>
        </div>

        <PasswordField
          autoComplete="new-password"
          error={passwordError}
          hidePasswordLabel={t("auth.form.password.hide")}
          id="auth-register-password"
          label={t("auth.register.password")}
          name="password"
          placeholder={t("auth.register.password.placeholder")}
          showPasswordLabel={t("auth.form.password.show")}
        />

        <PasswordField
          autoComplete="new-password"
          error={passwordConfirmationError}
          hidePasswordLabel={t("auth.form.password.hide")}
          id="auth-register-password-confirmation"
          label={t("auth.register.passwordConfirmation")}
          name="passwordConfirmation"
          placeholder={t("auth.register.passwordConfirmation.placeholder")}
          showPasswordLabel={t("auth.form.password.show")}
        />
      </div>

      <ul className="grid gap-1.5 text-[0.77rem] leading-5 text-[#6a7690]" aria-label={t("auth.register.password.requirements")}>
        <PasswordRequirement hasStarted={hasStartedPassword} isMet={passwordRequirements.hasMinimumLength}>
          {t("auth.register.password.minimumLength")}
        </PasswordRequirement>
        <PasswordRequirement hasStarted={hasStartedPassword} isMet={passwordRequirements.hasLetterAndNumber}>
          {t("auth.register.password.letterNumber")}
        </PasswordRequirement>
        <PasswordRequirement hasStarted={hasStartedPassword} isMet={passwordRequirements.hasSpecialCharacter}>
          {t("auth.register.password.specialCharacter")}
        </PasswordRequirement>
      </ul>

      <Button
        disabled={isSubmitting}
        className="h-12 rounded-[0.65rem] bg-[#101a2b] text-[0.92rem] font-medium text-white shadow-[0_7px_14px_rgb(18_32_55_/_12%)] transition-[background-color,transform,box-shadow] hover:bg-[#1c2940] active:translate-y-px focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/20"
        type="submit"
      >
        {isSubmitting ? t("auth.form.submitting") : t("auth.register.createAccount")}
        <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
      </Button>

      <p aria-live="polite" className={submitError ? "text-center text-[0.8rem] text-[#b42318]" : "sr-only"}>
        {submitError}
      </p>

      <p className="px-1 text-center text-[0.74rem] leading-5 text-[#6b7790]">
        {t("auth.register.terms.prefix")} {" "}
        <a className="font-medium text-[#415373] underline underline-offset-2" href="#terms">
          {t("auth.register.terms.terms")}
        </a>{" "}
        {t("auth.register.terms.and")} {" "}
        <a className="font-medium text-[#415373] underline underline-offset-2" href="#privacy">
          {t("auth.register.terms.privacy")}
        </a>
        .
      </p>

      <div className="grid justify-items-center gap-2 rounded-[0.7rem] border border-[#dfe5ee] px-5 py-4 text-center">
        <p className="text-[0.84rem] text-[#65718a]">{t("auth.register.haveAccount")}</p>
        <Link
          className="inline-flex items-center gap-1.5 text-[0.95rem] font-semibold text-[#1556e8]"
          href={authRouteHref("/login", language, returnTo)}
        >
          {t("auth.register.signIn")}
          <HiOutlineArrowRight aria-hidden="true" className="size-[1.1rem]" />
        </Link>
      </div>

    </form>
  );
}

function getEmailError(
  error: ValidationErrors["email"],
  t: ReturnType<typeof getAuthFormTranslations>,
) {
  if (!error) {
    return undefined;
  }

  return error === "invalid" ? t("auth.form.email.invalid") : t("auth.form.email.required");
}

function getPasswordError(
  error: ValidationErrors["password"],
  t: ReturnType<typeof getAuthFormTranslations>,
) {
  if (!error) {
    return undefined;
  }

  return error === "tooShort"
    ? t("auth.register.password.minimumLengthError")
    : t("auth.form.password.required");
}

function getPasswordConfirmationError(
  error: ValidationErrors["passwordConfirmation"],
  t: ReturnType<typeof getAuthFormTranslations>,
) {
  if (!error) {
    return undefined;
  }

  return error === "mismatch"
    ? t("auth.register.passwordConfirmation.mismatch")
    : t("auth.register.passwordConfirmation.required");
}

function clearValidationError(
  currentErrors: ValidationErrors,
  fieldName: "email" | "name" | "password" | "passwordConfirmation",
): ValidationErrors {
  if (fieldName === "name") {
    return { ...currentErrors, fullName: undefined };
  }

  return { ...currentErrors, [fieldName]: undefined };
}

function PasswordRequirement({
  children,
  hasStarted,
  isMet,
}: {
  children: ReactNode;
  hasStarted: boolean;
  isMet: boolean;
}) {
  const stateClassName = isMet
    ? "text-[#2e7d52]"
    : hasStarted
      ? "text-[#c81e1e]"
      : "text-[#6a7690]";

  return (
    <li className={`flex items-center gap-2 ${stateClassName}`}>
      {isMet ? (
        <HiCheckCircle aria-hidden="true" className="size-4 shrink-0 text-[#2e7d52]" />
      ) : (
        <HiOutlineCheckCircle
          aria-hidden="true"
          className={`size-4 shrink-0 ${stateClassName}`}
        />
      )}
      {children}
      {isMet ? <span className="sr-only"> — requirement met</span> : null}
    </li>
  );
}
