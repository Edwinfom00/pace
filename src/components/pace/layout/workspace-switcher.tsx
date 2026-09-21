"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HiOutlineArrowRight,
  HiOutlineChevronUp,
  HiOutlineChevronUpDown,
  HiOutlinePlus,
} from "react-icons/hi2";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { workspaceTypeMessageKeys } from "@/i18n/dashboard-messages";

import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import type { PaceSidebarLabels, SidebarWorkspace } from "./sidebar-types";
import { WorkspaceAvatar } from "./workspace-avatar";

type WorkspaceTab = "personal" | "shared";

function workspaceTabFor(workspace: SidebarWorkspace): WorkspaceTab {
  return workspace.type === "PERSONAL" ? "personal" : "shared";
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceSlug,
  labels,
  className,
}: {
  workspaces: readonly SidebarWorkspace[];
  activeWorkspaceSlug: string;
  labels: PaceSidebarLabels;
  className?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);
  const [pendingWorkspace, setPendingWorkspace] = useState<SidebarWorkspace | null>(null);
  const [, startNavigation] = useTransition();
  const activeWorkspace = workspaces.find((workspace) => workspace.slug === activeWorkspaceSlug) ?? workspaces[0];
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => (
    activeWorkspace && workspaceTabFor(activeWorkspace)
  ) || "personal");

  if (!activeWorkspace) return null;

  const visibleWorkspaces = workspaces.filter(
    (workspace) => workspace.slug !== activeWorkspace.slug && workspaceTabFor(workspace) === activeTab,
  );

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  const switchWorkspace = (
    event: MouseEvent<HTMLAnchorElement>,
    workspace: SidebarWorkspace,
  ) => {
    if (pendingWorkspace) {
      event.preventDefault();
      return;
    }

    if (workspace.slug === activeWorkspaceSlug) return;

    event.preventDefault();
    setPendingWorkspace(workspace);
    closeMobileSidebar();
    startNavigation(() => {
      router.push(`/w/${workspace.slug}/overview`);
    });
  };

  const workspaceBeingOpened = pendingWorkspace?.slug === activeWorkspaceSlug
    ? null
    : pendingWorkspace;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={labels["workspace.switch"]}
            aria-label={labels["workspace.switch"]}
            className={className ?? "h-11 rounded-[8px] px-2 text-[#344054] hover:bg-[#f2f4f7] data-[state=open]:bg-[#f2f4f7] group-data-[collapsible=icon]:size-8!"}
          >
            <WorkspaceAvatar className="size-9 rounded-[8px] group-data-[collapsible=icon]:size-10" name={activeWorkspace.name} />
            <span className="ml-2 grid min-w-0 flex-1 text-left group-data-[collapsible=icon]:sr-only">
              <span className="truncate text-sm font-semibold leading-5">{activeWorkspace.name}</span>
              <span className="truncate text-xs leading-4 text-[#98a2b3]">
                {labels[workspaceTypeMessageKeys[activeWorkspace.type]]}
              </span>
            </span>
            <HiOutlineChevronUpDown aria-hidden="true" className="size-4 text-[#98a2b3] group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[calc(100vw-2rem)] min-w-0 max-w-76 rounded-[16px] border-[#e4e6eb] bg-[#f7f7f8] p-2 shadow-[0_8px_8px_rgb(31_38_55/0.1)]"
          sideOffset={7}
        >
          <div
            aria-current="page"
            className="flex min-h-15 items-center gap-3 rounded-[11px] bg-white px-3 py-2 text-[#1f2937]"
          >
            <WorkspaceAvatar className="size-9 rounded-full" name={activeWorkspace.name} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium tracking-[-0.02em] text-[#171b24]">{activeWorkspace.name}</span>
                <span className="shrink-0 rounded-full bg-[#ecf7eb] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[#4d8052]">
                  {labels[workspaceTypeMessageKeys[activeWorkspace.type]]}
                </span>
              </span>
              <span className="truncate text-xs leading-4 text-[#9aa0ac]">
                {labels[workspaceTypeMessageKeys[activeWorkspace.type]]}
              </span>
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center text-[#1f2937]">
              <HiOutlineChevronUp aria-hidden="true" className="size-4" />
              <span className="sr-only">{labels["workspace.switch"]}</span>
            </span>
          </div>

          <div className="mt-2 grid grid-cols-2 rounded-[9px] bg-[#f1f1f3] p-1" role="tablist">
            {(["personal", "shared"] as const).map((tab) => {
              const isSelected = activeTab === tab;
              return (
                <button
                  aria-selected={isSelected}
                  className={`h-8 rounded-[7px] px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5282ee] ${isSelected ? "bg-white text-[#1b1f29] shadow-[0_2px_3px_rgb(31_38_55/0.1)]" : "text-[#6d7280] hover:text-[#313744]"}`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  role="tab"
                  type="button"
                >
                  {labels[`workspace.switch.${tab}`]}
                </button>
              );
            })}
          </div>

          <div className="mt-2.5">
            {visibleWorkspaces.map((workspace) => (
                <DropdownMenuItem
                  asChild
                  className="group min-h-13.5 cursor-pointer gap-2.5 rounded-[8px] px-2 text-[#252a35] focus:bg-white"
                  key={workspace.id}
                  onSelect={closeMobileSidebar}
                >
                  <Link
                    href={`/w/${workspace.slug}/overview`}
                    onClick={(event) => switchWorkspace(event, workspace)}
                  >
                    <WorkspaceAvatar className="size-9 rounded-full" name={workspace.name} />
                    <span className="grid min-w-0 flex-1 gap-px">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium tracking-[-0.02em] text-[#191d27]">{workspace.name}</span>
                        <span className="shrink-0 rounded-full bg-[#f0f1f5] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[#6b7280]">
                          {labels[workspaceTypeMessageKeys[workspace.type]]}
                        </span>
                      </span>
                      <span className="truncate text-xs leading-4 text-[#9ba1ad]">
                        {labels[workspaceTypeMessageKeys[workspace.type]]}
                      </span>
                    </span>
                    <HiOutlineArrowRight aria-hidden="true" className="size-4 text-[#a7acb6]" />
                  </Link>
                </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator className="mx-1 my-2.5 bg-[#e1e2e6]" />
          <DropdownMenuItem
            className="min-h-9 cursor-pointer rounded-[8px] border border-[#e1e3e8] bg-white px-2.5 font-medium text-[#171b24] shadow-[0_2px_3px_rgb(31_38_55/0.08)] focus:bg-white focus:text-[#171b24]"
            onSelect={() => setIsCreateWorkspaceOpen(true)}
          >
            <span className="flex-1 text-center">{labels["workspace.create"]}</span>
            <HiOutlinePlus aria-hidden="true" className="size-4 text-[#3d4657]" />
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-8 justify-center rounded-[8px] px-2.5 text-xs text-[#777d89] focus:bg-white focus:text-[#444b59]" onSelect={closeMobileSidebar}>
            <Link href="/join">
              <span>{labels["workspace.join"]}</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog
        labels={labels}
        onOpenChange={setIsCreateWorkspaceOpen}
        open={isCreateWorkspaceOpen}
      />
      {workspaceBeingOpened ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center bg-[#17223b]/12 px-6 backdrop-blur-[1px] motion-reduce:backdrop-blur-none"
          role="status"
        >
          <div className="flex w-full max-w-xs items-center gap-3 rounded-xl bg-white px-4 py-3 text-[#17223b] shadow-[0_8px_8px_rgb(16_24_40/0.08)]">
            <span aria-hidden="true" className="size-5 shrink-0 animate-spin rounded-full border-2 border-[#d6e1f6] border-t-[#2457c5] motion-reduce:animate-none" />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-semibold">Opening {workspaceBeingOpened.name}</span>
              <span className="text-xs text-[#667085]">Preparing your workspace</span>
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
