"use client";

import type { ReactNode } from "react";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { cn } from "@/lib/utils";

export function FilterLoadingSurface({
  children,
  detail,
  isLoading,
  label,
}: {
  children: ReactNode;
  detail?: string;
  isLoading: boolean;
  label: string;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden={isLoading || undefined}
        className={cn(
          "transition-[filter,opacity] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
          isLoading && "pointer-events-none select-none opacity-35 blur-[1px]",
        )}
      >
        {children}
      </div>
      {isLoading ? (
        <div
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-start justify-center bg-[#fbfcfe]/72 px-4 pt-[clamp(5.5rem,17vw,9.5rem)] backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          role="status"
        >
          <div className="w-full max-w-90 rounded-[12px] border border-[#dce6f5] bg-white px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="relative grid size-11 shrink-0 place-items-center">
                <span className="absolute inset-0 rounded-full border-2 border-[#dbe8fc]" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#2f75e8] border-r-[#2f75e8] motion-reduce:animate-none" />
                <PaceLogo alt="" height={23} variant="icon" width={23} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold tracking-[-0.01em] text-[#1c2a46]">
                  {label}
                </p>
                {detail ? (
                  <p className="mt-0.5 text-[12px] leading-5 text-[#61718c]">
                    {detail}
                  </p>
                ) : null}
              </div>
            </div>
            <div aria-hidden="true" className="mt-3 flex gap-1.5">
              <span className="h-1 flex-[1.2] animate-pulse rounded-full bg-[#cfe0fb] motion-reduce:animate-none" />
              <span className="h-1 flex-[0.75] animate-pulse rounded-full bg-[#dbe7f9] [animation-delay:160ms] motion-reduce:animate-none" />
              <span className="h-1 flex-1 animate-pulse rounded-full bg-[#cfe0fb] [animation-delay:320ms] motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
