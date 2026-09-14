"use client";

import Link from "next/link";
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

import type { PaceSidebarLabels, SidebarWorkspace } from "./sidebar-types";

function workspaceInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase() || "W";
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
  const activeWorkspace = workspaces.find((workspace) => workspace.slug === activeWorkspaceSlug) ?? workspaces[0];

  if (!activeWorkspace) return null;

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip={labels["workspace.switch"]}
          aria-label={labels["workspace.switch"]}
          className={className ?? "h-11 rounded-[7px] px-2 text-[#344054] hover:bg-[#f2f4f7] group-data-[collapsible=icon]:size-8!"}
        >
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[#eef2f7] text-sm font-semibold text-[#34405d]"
          >
            {workspaceInitial(activeWorkspace.name)}
          </span>
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
        className="min-w-56 rounded-[8px] border border-[#e5e7eb] p-1.5 shadow-[0_8px_24px_rgb(16_24_40/0.08)]"
        sideOffset={6}
      >
        {workspaces.map((workspace) => {
          const isActive = workspace.slug === activeWorkspaceSlug;
          return (
            <DropdownMenuItem asChild key={workspace.id} onSelect={closeMobileSidebar}>
              <Link aria-current={isActive ? "page" : undefined} href={`/w/${workspace.slug}/overview`}>
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[#eef2ff] text-[11px] font-semibold text-[#2457c5]"
                >
                  {workspaceInitial(workspace.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {isActive ? <HiOutlineCheck aria-hidden="true" className="size-4 text-[#2457c5]" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1 bg-[#eaecf0]" />
        <DropdownMenuItem disabled>
          <HiOutlinePlus aria-hidden="true" className="size-4" />
          <span>{labels["workspace.create"]}</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild onSelect={closeMobileSidebar}>
          <Link href="/join">
            <HiOutlinePlus aria-hidden="true" className="size-4" />
            <span>{labels["workspace.join"]}</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
