import type { ReactNode } from "react";

import { AuthLanguageSwitcher } from "@/components/pace/auth/auth-language-switcher";
import { PaceLogo } from "@/components/pace/brand/pace-logo";
import type { JoinLanguage } from "@/i18n/join-messages";

import { JoinBrandPanel } from "./join-brand-panel";

type JoinShellProps = {
  children: ReactNode;
  language: JoinLanguage;
};

export function JoinShell({ children, language }: JoinShellProps) {
  return (
    <main className="min-h-[100dvh] bg-[#f5f7fb] p-2 md:p-3 lg:p-4">
      <div className="grid min-h-[calc(100dvh-1rem)] overflow-hidden rounded-[1.125rem] border border-[#e3e8f1] bg-white md:h-[calc(100dvh-1.5rem)] md:min-h-0 md:grid-cols-[minmax(0,40fr)_minmax(0,60fr)] lg:h-[calc(100dvh-2rem)]">
        <JoinBrandPanel className="hidden md:block" language={language} />
        <section className="flex min-h-0 w-full flex-col overflow-y-auto bg-white px-6 text-[#17213a] sm:px-10 lg:px-[clamp(3.5rem,6vw,7.25rem)]">
          <header className="flex min-h-20 shrink-0 items-center justify-between sm:min-h-24">
            <PaceLogo className="md:hidden" height={32} width={107} />
            <span className="ml-auto"><AuthLanguageSwitcher language={language} /></span>
          </header>
          <div className="flex w-full flex-1 justify-center py-8 sm:py-11">
            <div className="w-full max-w-[46.75rem]">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
