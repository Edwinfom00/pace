import type { ReactNode } from "react";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { OnboardingProgress } from "@/components/pace/onboarding/onboarding-progress";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

import { OnboardingSidebar } from "./onboarding-sidebar";

type OnboardingShellProps = {
  /** Ready reuses the onboarding frame without presenting a sixth step. */
  variant?: "steps" | "ready";
  step?: OnboardingStep;
  language: OnboardingLanguage;
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function OnboardingShell({
  variant = "steps",
  step,
  language,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: OnboardingShellProps) {
  const isReady = variant === "ready";
  const currentStep = step ?? 5;

  return (
    <main className="min-h-[100dvh] bg-[#f3f7ff] p-0 md:h-[100dvh] md:min-h-0 md:overflow-hidden md:p-3 lg:p-4">
      <div className={isReady
        ? "min-h-[100dvh] bg-white md:h-[calc(100dvh-1.5rem)] md:min-h-0 md:rounded-[1.25rem] md:border md:border-[#e2e8f2] lg:h-[calc(100dvh-2rem)]"
        : "grid min-h-[100dvh] overflow-hidden bg-white md:h-[calc(100dvh-1.5rem)] md:min-h-0 md:grid-cols-[minmax(285px,32%)_minmax(0,68%)] md:rounded-[1.25rem] md:border md:border-[#e2e8f2] lg:h-[calc(100dvh-2rem)]"}>
        {!isReady ? <div className="hidden md:block"><OnboardingSidebar language={language} step={currentStep} /></div> : null}
        <section className={isReady
          ? "flex min-h-[100dvh] flex-col px-5 py-[max(1.5rem,env(safe-area-inset-top))] sm:px-9 md:min-h-0 md:overflow-y-auto md:px-12 md:py-10"
          : "flex min-h-0 flex-col px-5 py-6 sm:px-9 sm:py-9 md:overflow-hidden lg:px-[8.1%] lg:py-10 xl:px-[8.5%]"}>
          <header className={isReady ? "mx-auto flex w-full max-w-[620px] items-center" : "md:hidden"}>
            <div className="flex items-center justify-between gap-4">
              <PaceLogo height={32} preload={isReady} width={107} />
              {!isReady ? <OnboardingProgress compact language={language} step={currentStep} /> : null}
            </div>
          </header>
          <div className={isReady ? "mx-auto mt-12 w-full max-w-[620px] text-center sm:mt-14" : "mt-11 max-w-[850px] md:mt-0"}>
            {eyebrow ? <p className="text-sm font-semibold tracking-[0.08em] text-[#687fa7]">{eyebrow}</p> : null}
            <h1 className={isReady
              ? "text-balance mt-0 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.03em] text-[#0e1d3a] sm:text-[3rem]"
              : "mt-7 text-[clamp(2.15rem,4vw,3.75rem)] font-semibold leading-[1.03] tracking-[-0.052em] text-[#0e1d3a]"}>{title}</h1>
            <p className={isReady
              ? "mx-auto mt-4 max-w-[36rem] text-pretty text-[1.0625rem] leading-7 text-[#506a96]"
              : "mt-4 text-[clamp(1.05rem,1.8vw,1.45rem)] leading-8 text-[#6077a2]"}>{subtitle}</p>
          </div>
          <div className={isReady
            ? "mx-auto mt-10 w-full max-w-[620px] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:mt-12"
            : "mt-14 max-w-[920px] md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-5 lg:mt-16"}>{children}</div>
          {footer}
        </section>
      </div>
    </main>
  );
}
