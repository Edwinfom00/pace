"use client";

import type { ReactNode } from "react";
import { FiArrowLeft, FiX } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import { TransactionTypeSelector, type TransactionFormKind } from "./transaction-type-selector";

export type TransactionDialogView = "transaction" | "create-account";

export function TransactionFormDialog({
  children,
  createAccountHeader,
  footer,
  kind,
  onBackToTransaction,
  onKindChange,
  onOpenChange,
  open,
  view,
}: {
  readonly children: ReactNode;
  readonly createAccountHeader: { readonly backLabel: string; readonly description: string; readonly title: string };
  readonly footer?: ReactNode;
  readonly kind: TransactionFormKind;
  readonly onBackToTransaction: () => void;
  readonly onKindChange: (kind: TransactionFormKind) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly view: TransactionDialogView;
}) {
  return (
    <ResponsiveDialog onOpenChange={onOpenChange} open={open}>
      <ResponsiveDialogContent
        className="!flex max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-[650px] flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-[650px]"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
      >
        <ResponsiveDialogClose>
          <Button
            aria-label="Close add transaction dialog"
            className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4"
            size="icon"
            type="button"
            variant="ghost"
          >
            <FiX aria-hidden="true" className="size-[18px]" />
          </Button>
        </ResponsiveDialogClose>

        <ResponsiveDialogHeader className="gap-1 px-4 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pb-5 sm:pr-14">
          {view === "create-account" ? (
            <>
              <Button
                className="-ml-2 h-7 w-fit gap-1 rounded-[6px] px-2 text-[12px] font-medium text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30"
                onClick={onBackToTransaction}
                type="button"
                variant="ghost"
              >
                <FiArrowLeft aria-hidden="true" className="size-[15px]" />
                {createAccountHeader.backLabel}
              </Button>
              <ResponsiveDialogTitle className="mt-1 text-[20px] leading-6 font-semibold tracking-[-0.025em] text-[#101a35]">
                {createAccountHeader.title}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
                {createAccountHeader.description}
              </ResponsiveDialogDescription>
            </>
          ) : (
            <>
              <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-[-0.025em] text-[#101a35]">
                Add transaction
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
                Record a new movement in your workspace.
              </ResponsiveDialogDescription>
            </>
          )}
        </ResponsiveDialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
          {view === "transaction" ? <TransactionTypeSelector onValueChange={onKindChange} value={kind} /> : null}
          <div className={view === "transaction" ? "mt-5 text-[13px] leading-5 text-[#71809a]" : "text-[13px] leading-5 text-[#71809a]"}>
            {children}
          </div>
        </div>
        {view === "transaction" ? footer : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
