"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  HiOutlineArrowPath,
  HiOutlineArrowsRightLeft,
  HiOutlineBell,
  HiOutlineChartBarSquare,
  HiOutlineChevronRight,
  HiOutlineCog6Tooth,
  HiOutlineHome,
  HiOutlineInbox,
  HiOutlineMagnifyingGlass,
  HiOutlineSparkles,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import type { DashboardMessageKey } from "@/i18n/dashboard-messages";

import type { PaceSidebarLabels, SidebarWorkspace } from "./sidebar-types";
import { WorkspaceSwitcher } from "./workspace-switcher";

type QuickLink = {
  segment: string;
  labelKey: DashboardMessageKey;
  icon: IconType;
};

const quickLinks: readonly QuickLink[] = [
  { segment: "overview", labelKey: "navigation.overview", icon: HiOutlineHome },
  { segment: "inbox", labelKey: "navigation.inbox", icon: HiOutlineInbox },
  { segment: "transactions", labelKey: "navigation.transactions", icon: HiOutlineArrowsRightLeft },
  { segment: "recurring", labelKey: "navigation.recurring", icon: HiOutlineArrowPath },
  { segment: "plans", labelKey: "navigation.plans", icon: HiOutlineChartBarSquare },
  { segment: "insights", labelKey: "navigation.insights", icon: HiOutlineSparkles },
  { segment: "settings", labelKey: "navigation.settings", icon: HiOutlineCog6Tooth },
];

function MobileSidebarTrigger({ labels }: { labels: PaceSidebarLabels }) {
  const { state } = useSidebar();
  const label = state === "collapsed" ? labels["sidebar.expand"] : labels["sidebar.collapse"];

  return (
    <SidebarTrigger
      aria-label={label}
      className="size-9 rounded-[8px] text-[#53627b] hover:bg-[#f3f6fa] hover:text-[#17223b] focus-visible:ring-[#93b4f8]"
      title={label}
    />
  );
}

export function WorkspaceHeader({
  workspaces,
  activeWorkspaceSlug,
  labels,
}: {
  workspaces: readonly SidebarWorkspace[];
  activeWorkspaceSlug: string;
  labels: PaceSidebarLabels;
}) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const matchingLinks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return quickLinks;

    return quickLinks.filter((link) =>
      labels[link.labelKey].toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [labels, query]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#e7eaf0] bg-white px-2.5 sm:h-[68px] sm:px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <div className="md:hidden">
            <MobileSidebarTrigger labels={labels} />
          </div>
          <button
            aria-haspopup="dialog"
            className="flex h-10 min-w-0 max-w-[34rem] flex-1 items-center gap-2.5 rounded-[9px] bg-[#f4f6f9] px-3 text-left text-sm text-[#6f7d95] transition-colors hover:bg-[#edf1f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5c85da] sm:px-3.5"
            onClick={() => setIsSearchOpen(true)}
            type="button"
          >
            <HiOutlineMagnifyingGlass aria-hidden="true" className="size-[18px] shrink-0 text-[#60708b]" />
            <span className="min-w-0 flex-1 truncate max-sm:sr-only">{labels["header.search"]}</span>
            <kbd className="hidden shrink-0 rounded-[5px] border border-[#dce2eb] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#7b879e] sm:inline">
              ⌘ K
            </kbd>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <WorkspaceSwitcher
            activeWorkspaceSlug={activeWorkspaceSlug}
            className="h-10 w-auto max-w-[9.25rem] rounded-[9px] px-1.5 text-[#24314b] hover:bg-[#f4f6f9] data-[state=open]:bg-[#f4f6f9] max-sm:size-10! max-sm:p-0! max-sm:[&>span]:hidden max-sm:[&>svg]:hidden sm:max-w-[12rem] sm:px-2"
            labels={labels}
            workspaces={workspaces}
          />
          <span aria-hidden="true" className="hidden h-7 w-px bg-[#e5e9f0] sm:block" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={labels["header.notifications"]}
                className="grid size-9 place-items-center rounded-[8px] text-[#53627b] transition-colors hover:bg-[#f3f6fa] hover:text-[#17223b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5c85da]"
                title={labels["header.notifications"]}
                type="button"
              >
                <HiOutlineBell aria-hidden="true" className="size-[19px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 rounded-[10px] border-[#e1e6ee] p-0 shadow-[0_8px_8px_rgb(16_24_40/0.06)]">
              <div className="px-4 py-3.5">
                <p className="text-sm font-semibold text-[#1d2941]">{labels["header.notifications"]}</p>
                <p className="mt-1 text-[13px] leading-5 text-[#6e7b92]">{labels["header.notificationsEmpty"]}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-[#8a96aa]">{labels["header.notificationsHint"]}</p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <ResponsiveDialog
        onOpenChange={(open) => {
          setIsSearchOpen(open);
          if (!open) setQuery("");
        }}
        open={isSearchOpen}
      >
        <ResponsiveDialogContent
          className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[12px] border border-[#e2e7ef] bg-white p-0 text-[#1c2942] shadow-[0_18px_40px_rgb(16_24_40/0.12)] sm:max-w-xl"
          drawerClassName="rounded-t-[16px]"
        >
          <ResponsiveDialogHeader className="border-b border-[#e9edf3] px-4 pt-5 pb-4 sm:px-5">
            <ResponsiveDialogTitle className="text-[15px] font-semibold text-[#1b2842]">
              {labels["header.searchTitle"]}
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
              {labels["header.searchDescription"]}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="border-b border-[#e9edf3] px-4 py-3 sm:px-5">
            <label className="flex h-11 items-center gap-2.5 rounded-[8px] border border-[#dce3ed] bg-[#fbfcfe] px-3 focus-within:border-[#7e9de0] focus-within:ring-2 focus-within:ring-[#dce7ff]">
              <HiOutlineMagnifyingGlass aria-hidden="true" className="size-[18px] shrink-0 text-[#65738a]" />
              <span className="sr-only">{labels["header.searchTitle"]}</span>
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-[#26334d] outline-none placeholder:text-[#8b96a9]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels["header.searchPlaceholder"]}
                type="search"
                value={query}
              />
            </label>
          </div>
          <nav aria-label={labels["header.searchTitle"]} className="max-h-72 overflow-y-auto p-2 sm:max-h-80">
            {matchingLinks.length ? (
              matchingLinks.map((link) => {
                const Icon = link.icon;
                const label = labels[link.labelKey];

                return (
                  <Link
                    className="group flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-sm font-medium text-[#33415b] transition-colors hover:bg-[#f3f6fb] hover:text-[#17223b] focus-visible:bg-[#edf3ff] focus-visible:outline-none"
                    href={`/w/${activeWorkspaceSlug}/${link.segment}`}
                    key={link.segment}
                    onClick={() => setIsSearchOpen(false)}
                  >
                    <span className="grid size-7 place-items-center rounded-[7px] bg-[#f1f4f8] text-[#5a6b87] group-hover:bg-white group-hover:text-[#2457c5]">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <HiOutlineChevronRight aria-hidden="true" className="size-4 text-[#a4afbf]" />
                  </Link>
                );
              })
            ) : (
              <p className="px-3 py-8 text-center text-sm text-[#71809a]">{labels["header.noResults"]}</p>
            )}
          </nav>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
