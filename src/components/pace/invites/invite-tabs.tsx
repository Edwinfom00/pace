"use client";

import type { ReactNode } from "react";
import { Tabs } from "radix-ui";

import type { OnboardingInviteMethod } from "@/modules/onboarding/profile-domain";

type InviteTabsProps = {
  value: OnboardingInviteMethod;
  onValueChange: (value: OnboardingInviteMethod) => void;
  emailLabel: string;
  linkLabel: string;
  emailContent: ReactNode;
  linkContent: ReactNode;
};

/** Radix tabs retain correct tab, tabpanel, focus, and keyboard semantics. */
export function InviteTabs({
  value,
  onValueChange,
  emailLabel,
  linkLabel,
  emailContent,
  linkContent,
}: InviteTabsProps) {
  return (
    <Tabs.Root
      onValueChange={(next) => {
        if (next === "email" || next === "link") onValueChange(next);
      }}
      value={value}
    >
      <Tabs.List className="grid grid-cols-2 border-b border-[#dce4f0]" aria-label={`${emailLabel} / ${linkLabel}`}>
        <Tabs.Trigger
          className="relative h-13 px-4 text-[16px] font-medium text-[#1b3159] outline-none transition after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:scale-x-0 after:bg-[#3268ed] after:transition-transform data-[state=active]:font-semibold data-[state=active]:text-[#1758e8] data-[state=active]:after:scale-x-100 focus-visible:bg-[#f0f5ff]"
          value="email"
        >
          {emailLabel}
        </Tabs.Trigger>
        <Tabs.Trigger
          className="relative h-13 px-4 text-[16px] font-medium text-[#1b3159] outline-none transition after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:scale-x-0 after:bg-[#3268ed] after:transition-transform data-[state=active]:font-semibold data-[state=active]:text-[#1758e8] data-[state=active]:after:scale-x-100 focus-visible:bg-[#f0f5ff]"
          value="link"
        >
          {linkLabel}
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content className="outline-none" value="email">
        {emailContent}
      </Tabs.Content>
      <Tabs.Content className="outline-none" value="link">
        {linkContent}
      </Tabs.Content>
    </Tabs.Root>
  );
}
