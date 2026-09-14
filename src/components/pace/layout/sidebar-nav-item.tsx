"use client";

import Link from "next/link";
import type { IconType } from "react-icons";

import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type SidebarNavItemProps = {
  href: string;
  icon: IconType;
  label: string;
  isActive: boolean;
  badge?: number;
  tooltip?: string;
};

export function SidebarNavItem({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
  tooltip = label,
}: SidebarNavItemProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={tooltip}
        className="h-11 gap-4 rounded-[8px] px-4 text-[15px] font-medium text-[#34405d] hover:bg-[#f6f8fc] hover:text-[#18213c] data-[active=true]:bg-[#eef4ff] data-[active=true]:text-[#18213c] data-[active=true]:font-semibold group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:p-2! [&_svg]:size-5!"
      >
        <Link
          href={href}
          aria-current={isActive ? "page" : undefined}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <Icon aria-hidden="true" />
          <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
        </Link>
      </SidebarMenuButton>
      {badge && badge > 0 ? (
        <SidebarMenuBadge className="right-2 rounded-[5px] bg-[#e7efff] px-1.5 text-[11px] font-semibold text-[#2457c5]">
          {badge}
        </SidebarMenuBadge>
      ) : null}
    </SidebarMenuItem>
  );
}
