"use client";

import { useState } from "react";
import {
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFieldProps = {
  error?: string;
  forgotPasswordLabel: string;
  forgotPasswordUrl?: string;
  hidePasswordLabel: string;
  label: string;
  placeholder: string;
  showPasswordLabel: string;
};

export function PasswordField({
  error,
  forgotPasswordLabel,
  forgotPasswordUrl,
  hidePasswordLabel,
  label,
  placeholder,
  showPasswordLabel,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);
  const errorId = "auth-password-error";

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label className="text-[0.9rem] font-medium text-[#17213a]" htmlFor="auth-password">
          {label}
        </Label>
        {forgotPasswordUrl ? (
          <a
            className="shrink-0 text-[0.81rem] font-medium text-[#1556e8] transition-colors hover:text-[#0b3eae] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2360e8]/40"
            href={forgotPasswordUrl}
          >
            {forgotPasswordLabel}
          </a>
        ) : (
          <span className="shrink-0 text-[0.81rem] font-medium text-[#1556e8]">
            {forgotPasswordLabel}
          </span>
        )}
      </div>
      <div className="relative">
        <HiOutlineLockClosed
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-[#52617c]"
        />
        <Input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete="current-password"
          className="h-[3.25rem] rounded-[0.65rem] border-[#dbe2ec] bg-white pl-11 pr-12 text-[0.92rem] text-[#17213a] placeholder:text-[#75819a] hover:border-[#cbd5e1] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/12 [@media(max-height:850px)]:h-11"
          id="auth-password"
          name="password"
          placeholder={placeholder}
          required
          type={isVisible ? "text" : "password"}
        />
        <Button
          aria-label={isVisible ? hidePasswordLabel : showPasswordLabel}
          className="absolute top-1/2 right-1.5 size-9 -translate-y-1/2 rounded-md p-0 text-[#53617b] hover:bg-[#f3f6fa] hover:text-[#17213a] focus-visible:border-[#2360e8] focus-visible:ring-4 focus-visible:ring-[#2360e8]/15"
          onClick={() => setIsVisible((visible) => !visible)}
          type="button"
          variant="ghost"
        >
          {isVisible ? (
            <HiOutlineEyeSlash aria-hidden="true" className="size-5" />
          ) : (
            <HiOutlineEye aria-hidden="true" className="size-5" />
          )}
        </Button>
      </div>
      <p
        aria-live="polite"
        className={error ? "text-[0.78rem] text-[#b42318]" : "sr-only"}
        id={errorId}
      >
        {error}
      </p>
    </div>
  );
}
