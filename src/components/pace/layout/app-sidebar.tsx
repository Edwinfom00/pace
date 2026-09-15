"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import {
  Sidebar,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { SidebarNavigation } from "./sidebar-navigation";
import type { PaceSidebarLabels, SidebarWorkspace } from "./sidebar-types";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceSwitcher } from "./workspace-switcher";

function PaceSidebarTrigger({ labels }: { labels: PaceSidebarLabels }) {
  const { state } = useSidebar();
  const label = state === "collapsed" ? labels["sidebar.expand"] : labels["sidebar.collapse"];

  return (
    <SidebarTrigger
      aria-label={label}
      title={label}
      className="size-8 rounded-[7px] text-[#98a2b3] shadow-none hover:bg-[#f1f4f8] hover:text-[#475467] focus-visible:ring-[#93b4f8]"
    />
  );
}

function AppSidebar({
  workspaces,
  activeWorkspaceSlug,
  labels,
  inboxCount,
}: {
  workspaces: readonly SidebarWorkspace[];
  activeWorkspaceSlug: string;
  labels: PaceSidebarLabels;
  inboxCount?: number;
}) {
  const { state } = useSidebar();
  const overviewHref = `/w/${activeWorkspaceSlug}/overview`;

  return (
    <Sidebar
      collapsible="icon"
      className="border-[#e7e9ee] bg-[#fafafb]"
      style={{ "--sidebar": "#fafafb" } as CSSProperties}
    >
      <SidebarHeader className="gap-0 px-5 pt-[60px] pb-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-start justify-between gap-3 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
          <Link
            aria-label={labels["brand.name"]}
            className="flex h-[35px] min-w-0 items-center rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[#93b4f8] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center"
            href={overviewHref}
          >
            {state === "collapsed" ? (
              <PaceLogo alt="" height={28} variant="icon" width={28} />
            ) : (
              <PaceLogo alt="" height={35} variant="full" width={117} />
            )}
          </Link>
          <PaceSidebarTrigger labels={labels} />
        </div>
        {state !== "collapsed" ? (
          <p className="ml-[45px] w-[124px] text-[13px] leading-[17px] tracking-[-0.01em] text-[#7c89a2]">
            {labels["brand.description"]}
          </p>
        ) : null}
      </SidebarHeader>
      <SidebarNavigation
        inboxCount={inboxCount}
        labels={labels}
        workspaceSlug={activeWorkspaceSlug}
      />
      <SidebarFooter className="px-6 pt-2 pb-7 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-3">
        <div className="flex w-full items-center group-data-[collapsible=icon]:flex-col">
          <WorkspaceSwitcher
            activeWorkspaceSlug={activeWorkspaceSlug}
            className="h-11 min-w-0 flex-1 rounded-[8px] px-0 text-[#34405d] hover:bg-[#f6f8fc] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0!"
            labels={labels}
            workspaces={workspaces}
          />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function PaceDashboardShell({
  children,
  workspaces,
  activeWorkspaceSlug,
  labels,
  inboxCount,
}: {
  children: ReactNode;
  workspaces: readonly SidebarWorkspace[];
  activeWorkspaceSlug: string;
  labels: PaceSidebarLabels;
  /** Prepared for a lightweight server-resolved unresolved-item count. */
  inboxCount?: number;
}) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as CSSProperties}
      >
        <AppSidebar
          activeWorkspaceSlug={activeWorkspaceSlug}
          inboxCount={inboxCount}
          labels={labels}
        workspaces={workspaces}
        />
        <SidebarInset className="min-h-svh bg-[#fbfcfe]">
          <WorkspaceHeader
            activeWorkspaceSlug={activeWorkspaceSlug}
            labels={labels}
            workspaces={workspaces}
          />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
