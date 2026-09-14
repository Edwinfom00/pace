"use client";

import type { ReactNode } from "react";
import { Tabs } from "radix-ui";

type InviteTabsProps = {
  code: ReactNode;
  codeLabel: string;
  link: ReactNode;
  linkLabel: string;
  onValueChange?: (value: "code" | "link") => void;
  value: "code" | "link";
};

export function InviteTabs({
  code,
  codeLabel,
  link,
  linkLabel,
  onValueChange,
  value,
}: InviteTabsProps) {
  return (
    <Tabs.Root onValueChange={(next) => onValueChange?.(next as "code" | "link")} value={value}>
      <Tabs.List className="grid grid-cols-2 border-b border-[#dce4f0]" aria-label="Invitation method">
        <Tabs.Trigger className="border-b-2 border-transparent px-3 py-4 text-[0.94rem] font-medium text-[#657493] outline-none transition data-[state=active]:border-[#1760f5] data-[state=active]:text-[#0759ef] focus-visible:bg-[#f4f7ff]" value="code">
          {codeLabel}
        </Tabs.Trigger>
        <Tabs.Trigger className="border-b-2 border-transparent px-3 py-4 text-[0.94rem] font-medium text-[#657493] outline-none transition data-[state=active]:border-[#1760f5] data-[state=active]:text-[#0759ef] focus-visible:bg-[#f4f7ff]" value="link">
          {linkLabel}
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content className="px-5 py-7 sm:px-7" value="code">{code}</Tabs.Content>
      <Tabs.Content className="px-5 py-7 sm:px-7" value="link">{link}</Tabs.Content>
    </Tabs.Root>
  );
}
