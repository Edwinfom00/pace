import type { ReactNode } from "react";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { OnboardingProgress } from "@/components/pace/onboarding/onboarding-progress";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

import { OnboardingSidebar } from "./onboarding-sidebar";

type OnboardingShellProps = {
  step: OnboardingStep;
  language: OnboardingLanguage;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function OnboardingShell({
  step,
  language,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: OnboardingShellProps) {
  return (
    <main className="min-h-[100dvh] bg-[#f3f7ff] p-0 md:h-[100dvh] md:min-h-0 md:overflow-hidden md:p-3 lg:p-4">
      <div className="grid min-h-[100dvh] overflow-hidden bg-white md:h-[calc(100dvh-1.5rem)] md:min-h-0 md:grid-cols-[minmax(285px,32%)_minmax(0,68%)] md:rounded-[1.25rem] md:border md:border-[#e2e8f2] lg:h-[calc(100dvh-2rem)]">
        <div className="hidden md:block"><OnboardingSidebar language={language} step={step} /></div>
        <section className="flex min-h-0 flex-col px-5 py-6 sm:px-9 sm:py-9 md:overflow-hidden lg:px-[8.1%] lg:py-10 xl:px-[8.5%]">
          <header className="md:hidden">
            <div className="flex items-center justify-between gap-4">
              <PaceLogo height={32} width={107} />
              <OnboardingProgress compact language={language} step={step} />
            </div>
          </header>
          <div className="mt-11 max-w-[850px] md:mt-0">
            <p className="text-sm font-semibold tracking-[0.08em] text-[#687fa7]">{eyebrow}</p>
            <h1 className="mt-7 text-[clamp(2.15rem,4vw,3.75rem)] font-semibold leading-[1.03] tracking-[-0.052em] text-[#0e1d3a]">{title}</h1>
            <p className="mt-4 text-[clamp(1.05rem,1.8vw,1.45rem)] leading-8 text-[#6077a2]">{subtitle}</p>
          </div>
          <div className="mt-14 max-w-[920px] md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-5 lg:mt-16">{children}</div>
          {footer}
        </section>
      </div>
    </main>
  );
}
