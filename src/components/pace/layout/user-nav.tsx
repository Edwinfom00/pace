"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HiOutlineAdjustmentsHorizontal,
  HiOutlineEllipsisVertical,
  HiOutlineUserCircle,
} from "react-icons/hi2";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";

import type { PaceSidebarLabels, SidebarUser } from "./sidebar-types";

function userInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");

  return initials.toLocaleUpperCase() || "P";
}

export function UserNav({
  user,
  labels,
  profileHref,
  preferencesHref,
}: {
  user: SidebarUser;
  labels: PaceSidebarLabels;
  /** Optional until an approved profile route exists. */
  profileHref?: string;
  /** Optional until an approved preferences route exists. */
  preferencesHref?: string;
}) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          tooltip={labels["account.menu"]}
          aria-label={labels["account.menu"]}
          className="h-11 rounded-[7px] px-2 text-[#344054] hover:bg-[#f2f4f7] group-data-[collapsible=icon]:size-8!"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-[#eef2ff] text-[11px] font-semibold text-[#2457c5]">
              {userInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 flex-1 text-left group-data-[collapsible=icon]:sr-only">
            <span className="truncate text-[13px] font-semibold leading-4">{user.name}</span>
            <span className="truncate text-[11px] leading-4 text-[#98a2b3]">{user.email}</span>
          </span>
          <HiOutlineEllipsisVertical aria-hidden="true" className="size-4 text-[#98a2b3] group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-52 rounded-[8px] border border-[#e5e7eb] p-1.5 shadow-[0_8px_24px_rgb(16_24_40_/_0.08)]"
        side="top"
        sideOffset={6}
      >
        {profileHref ? (
          <DropdownMenuItem asChild onSelect={closeMobileSidebar}>
            <Link href={profileHref}>
              <HiOutlineUserCircle aria-hidden="true" className="size-4" />
              <span>{labels["account.profile"]}</span>
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <HiOutlineUserCircle aria-hidden="true" className="size-4" />
            <span>{labels["account.profile"]}</span>
          </DropdownMenuItem>
        )}
        {preferencesHref ? (
          <DropdownMenuItem asChild onSelect={closeMobileSidebar}>
            <Link href={preferencesHref}>
              <HiOutlineAdjustmentsHorizontal aria-hidden="true" className="size-4" />
              <span>{labels["account.preferences"]}</span>
            </Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>
            <HiOutlineAdjustmentsHorizontal aria-hidden="true" className="size-4" />
            <span>{labels["account.preferences"]}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-1 bg-[#eaecf0]" />
        <DropdownMenuItem
          disabled={isSigningOut}
          variant="destructive"
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          <span>{labels["account.signOut"]}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
