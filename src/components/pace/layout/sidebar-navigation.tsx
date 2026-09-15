"use client";

import { usePathname } from "next/navigation";
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineChartBarSquare,
  HiOutlineCog6Tooth,
  HiOutlineHome,
  HiOutlineInbox,
  HiOutlineSparkles,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

import { formatDashboardLabel, type DashboardMessageKey } from "@/i18n/dashboard-messages";
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
} from "@/components/ui/sidebar";

import { SidebarNavItem } from "./sidebar-nav-item";
import type { PaceSidebarLabels } from "./sidebar-types";

type NavigationItem = {
  key: string;
  segment: string;
  labelKey: DashboardMessageKey;
  icon: IconType;
};

const primaryNavigation: readonly NavigationItem[] = [
  { key: "overview", segment: "overview", labelKey: "navigation.overview", icon: HiOutlineHome },
  { key: "inbox", segment: "inbox", labelKey: "navigation.inbox", icon: HiOutlineInbox },
  { key: "transactions", segment: "transactions", labelKey: "navigation.transactions", icon: HiOutlineArrowsRightLeft },
  { key: "recurring", segment: "recurring", labelKey: "navigation.recurring", icon: HiOutlineArrowPath },
  { key: "plans", segment: "plans", labelKey: "navigation.plans", icon: HiOutlineChartBarSquare },
  { key: "insights", segment: "insights", labelKey: "navigation.insights", icon: HiOutlineSparkles },
];

const secondaryNavigation: readonly NavigationItem[] = [
  { key: "settings", segment: "settings", labelKey: "navigation.settings", icon: HiOutlineCog6Tooth },
];

function workspacePath(workspaceSlug: string, segment: string) {
  return `/w/${workspaceSlug}/${segment}`;
}

export function isSidebarPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNavigation({
  workspaceSlug,
  labels,
  inboxCount,
}: {
  workspaceSlug: string;
  labels: PaceSidebarLabels;
  /** Prepared for a lightweight server-resolved unresolved-item count. */
  inboxCount?: number;
}) {
  const pathname = usePathname();

  const renderNavigation = (items: readonly NavigationItem[]) =>
    items.map((item) => {
      const href = workspacePath(workspaceSlug, item.segment);
      const badge = item.key === "inbox" ? inboxCount : undefined;
      const label = labels[item.labelKey];
      const tooltip = badge && badge > 0
        ? formatDashboardLabel(labels, "navigation.inboxCount", { count: badge })
        : label;

      return (
        <SidebarNavItem
          badge={badge}
          href={href}
          icon={item.icon}
          isActive={isSidebarPathActive(pathname, href)}
          key={item.key}
          label={label}
          tooltip={tooltip}
        />
      );
    });

  return (
    <SidebarContent className="px-0">
      <SidebarGroup className="px-3 pt-6 pb-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-4">
        <nav aria-label={labels["navigation.label"]} className="group-data-[collapsible=icon]:w-8">
          <SidebarMenu className="gap-1">{renderNavigation(primaryNavigation)}</SidebarMenu>
        </nav>
      </SidebarGroup>
      <SidebarGroup className="px-3 py-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-4">
        <nav aria-label={labels["navigation.secondaryLabel"]} className="group-data-[collapsible=icon]:w-8">
          <SidebarMenu className="gap-1">{renderNavigation(secondaryNavigation)}</SidebarMenu>
        </nav>
      </SidebarGroup>
    </SidebarContent>
  );
}
