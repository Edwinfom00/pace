import type { ReactNode } from "react";

type OnboardingSelectCardProps = {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
};

export function OnboardingSelectCard({ label, htmlFor, error, children }: OnboardingSelectCardProps) {
  return (
    <div>
      <label className="mb-2.5 block text-[15px] font-semibold text-[#172442]" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-sm text-red-600" id={`${htmlFor}-error`}>{error}</p> : null}
    </div>
  );
}
