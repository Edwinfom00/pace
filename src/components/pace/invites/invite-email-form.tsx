"use client";

import { useState, type FormEvent } from "react";
import { FiMail, FiUsers } from "react-icons/fi";

type InviteEmailFormProps = {
  emailLabel: string;
  emailPlaceholder: string;
  invalidEmailLabel: string;
  infoTitle: string;
  infoSubtitle: string;
  createLabel: string;
  disabled: boolean;
  onCreate: (email: string) => void;
};

export function InviteEmailForm({
  emailLabel,
  emailPlaceholder,
  invalidEmailLabel,
  infoTitle,
  infoSubtitle,
  createLabel,
  disabled,
  onCreate,
}: InviteEmailFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!valid) {
      setError(invalidEmailLabel);
      return;
    }

    setError("");
    onCreate(email.trim());
  }

  return (
    <form className="px-7 pb-7 pt-6 sm:px-8" noValidate onSubmit={submit}>
      <label className="mb-2 block text-[15px] font-medium text-[#111f3b]" htmlFor="onboarding-invite-email">
        {emailLabel}
      </label>
      <div className="relative">
        <FiMail aria-hidden className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#6078a4]" />
        <input
          aria-describedby={error ? "onboarding-invite-email-error" : undefined}
          aria-invalid={Boolean(error)}
          className="h-[52px] w-full rounded-[10px] border border-[#d7e1f0] bg-white py-3 pl-13 pr-4 text-[16px] text-[#14223f] outline-none transition placeholder:text-[#7185aa] focus:border-[#3268ed] focus:ring-4 focus:ring-[#3268ed]/10 aria-invalid:border-red-500 aria-invalid:ring-red-100"
          id="onboarding-invite-email"
          inputMode="email"
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError("");
          }}
          placeholder={emailPlaceholder}
          type="email"
          value={email}
        />
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-5 text-sm text-red-600" id="onboarding-invite-email-error">
        {error}
      </p>

      <div className="mt-3 flex gap-4 rounded-[10px] bg-[#f2f6fd] px-5 py-4 text-[#233d69]">
        <FiUsers aria-hidden className="mt-0.5 size-6 shrink-0 text-[#3d6bd5]" />
        <div>
          <p className="text-[15px] font-medium leading-5">{infoTitle}</p>
          <p className="mt-1 text-sm leading-5 text-[#536b95]">{infoSubtitle}</p>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          className="h-11 rounded-[9px] bg-[#3268ed] px-5 text-sm font-semibold text-white transition hover:bg-[#255be2] disabled:cursor-wait disabled:opacity-65"
          disabled={disabled}
          type="submit"
        >
          {createLabel}
        </button>
      </div>
    </form>
  );
}
