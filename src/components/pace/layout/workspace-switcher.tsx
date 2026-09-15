"use client";

import { useState, useTransition, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HiOutlineCheck,
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

  if (!activeWorkspace) return null;

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
          className="min-w-64 rounded-[10px] border-[#e4e7ec] p-1.5 shadow-[0_8px_8px_rgb(16_24_40/0.06)]"
          sideOffset={7}
        >
          {workspaces.map((workspace) => {
            const isActive = workspace.slug === activeWorkspaceSlug;
            return (
              <DropdownMenuItem asChild className="min-h-10 cursor-pointer gap-2.5 rounded-[7px] px-2 text-[#344054] focus:bg-[#f4f6fb]" key={workspace.id} onSelect={closeMobileSidebar}>
                <Link
                  aria-current={isActive ? "page" : undefined}
                  href={`/w/${workspace.slug}/overview`}
                  onClick={(event) => switchWorkspace(event, workspace)}
                >
                  <WorkspaceAvatar className="size-7 rounded-[7px]" name={workspace.name} />
                  <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
                  {isActive ? <HiOutlineCheck aria-hidden="true" className="size-4 text-[#2457c5]" /> : null}
                </Link>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator className="my-1.5 bg-[#eaecf0]" />
          <DropdownMenuItem
            className="min-h-9 cursor-pointer gap-2 rounded-[7px] px-2 text-[#475467] focus:bg-[#f4f6fb]"
            onSelect={() => setIsCreateWorkspaceOpen(true)}
          >
            <HiOutlinePlus aria-hidden="true" className="size-4 text-[#667085]" />
            <span>{labels["workspace.create"]}</span>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-9 cursor-pointer gap-2 rounded-[7px] px-2 text-[#475467] focus:bg-[#f4f6fb]" onSelect={closeMobileSidebar}>
            <Link href="/join">
              <HiOutlinePlus aria-hidden="true" className="size-4 text-[#667085]" />
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
