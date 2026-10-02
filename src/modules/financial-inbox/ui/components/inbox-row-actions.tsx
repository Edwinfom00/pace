"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { formatTransactionAmount } from "@/modules/transactions/ui/components/transaction-formatters";

import type { InboxOverviewItem } from "../../inbox-overview";
import {
  createAcceptInboxCategorySuggestionRequest,
  createChooseInboxCategoryRequest,
  inboxCategoryResolutionErrorCode,
  mapInboxCategoryResolutionFailure,
} from "../inbox-category-resolution-flow";

type QuickAction = "ACCEPT" | "KEEP" | "REVIEW_TRANSFER" | "DISMISS";

const itemClassName = "rounded-[6px] px-2.5 py-2 text-[13px] text-[#34415a]";

function idempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `inbox-row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InboxRowActions({
  item,
  destination,
  labels,
  locale,
  workspaceId,
  workspaceSlug,
}: {
  readonly item: InboxOverviewItem;
  readonly destination: string;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const merchant = item.transaction.merchant.name;
  const open = item.status === "OPEN";
  const { capabilities } = item;
  const proposal = item.classification?.proposal ?? null;
  const currentCategory = item.transaction.category?.label ?? null;
  const canAccept = open && capabilities.canAcceptCategorySuggestion && proposal !== null;
  const canKeep = open && capabilities.canChooseCategory && item.currentCategoryId !== null
    && (!proposal || proposal.id !== item.currentCategoryId);
  const canChoose = open && capabilities.canChooseCategory;
  const canReview = open && capabilities.canReviewTransfer;
  const canDismiss = open && capabilities.canDismiss;
  const hasQuickActions = canAccept || canKeep || canChoose || canReview;

  async function run(action: QuickAction) {
    if (pending) return;
    setPending(true);
    const toastId = toast.loading(labels["inbox.rowActions.working"].replace("{merchant}", merchant));
    try {
      const response = await send(action);
      if (response.ok) {
        setConfirmDismiss(false);
        toast.success(
          labels[action === "DISMISS" ? "inbox.rowActions.done.dismissed" : "inbox.rowActions.done.resolved"]
            .replace("{merchant}", merchant),
          { id: toastId },
        );
        router.refresh();
        return;
      }
      toast.error(failureMessage(action, response.status, await response.json().catch(() => null)), { id: toastId });
      if (response.status === 409) router.refresh();
    } catch {
      toast.error(labels["inbox.resolve.failed"], { id: toastId });
    } finally {
      setPending(false);
    }
  }

  function send(action: QuickAction) {
    const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(item.id)}`;
    const versions = {
      expectedInboxUpdatedAt: item.updatedAt,
      expectedTransactionUpdatedAt: item.transactionUpdatedAt,
    };
    if (action === "ACCEPT" && proposal && item.classification) {
      return post(`${base}/category`, createAcceptInboxCategorySuggestionRequest({
        ...versions,
        suggestionCategoryId: proposal.id,
        suggestionUpdatedAt: item.classification.updatedAt,
      }, idempotencyKey()));
    }
    if (action === "KEEP" && item.currentCategoryId) {
      return post(`${base}/category`, createChooseInboxCategoryRequest({
        ...versions,
        categoryId: item.currentCategoryId,
      }, idempotencyKey()));
    }
    return post(`${base}/resolve`, { action });
  }

  function failureMessage(action: QuickAction, status: number, payload: unknown): string {
    if (action === "ACCEPT" || action === "KEEP") {
      const failure = mapInboxCategoryResolutionFailure(inboxCategoryResolutionErrorCode(payload));
      if (failure.error === "staleSuggestion") return labels["inbox.category.staleSuggestion"];
      if (failure.error === "changedSinceOpen") return labels["inbox.resolve.conflict"];
      if (failure.error === "notAvailable" || failure.error === "category") return labels["inbox.resolve.notAvailable"];
      return labels["inbox.resolve.failed"];
    }
    if (status === 409) return labels["inbox.resolve.conflict"];
    if ([401, 403, 404].includes(status)) return labels["inbox.resolve.notAvailable"];
    return labels["inbox.resolve.failed"];
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-busy={pending}
            aria-label={`${labels["inbox.rowActions"]}: ${merchant}`}
            className="grid size-8 place-items-center rounded-[7px] text-[#53627b] transition-colors hover:bg-[#f3f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb] disabled:opacity-50"
            disabled={pending}
            type="button">
            <FiMoreHorizontal aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-[9px] border border-[#e4e9f1] bg-white p-1 shadow-[0_5px_14px_rgb(16_24_40/10%)]">
          {canAccept && proposal ? (
            <DropdownMenuItem className={`${itemClassName} font-medium text-[#14935f]`} onSelect={() => void run("ACCEPT")}>
              <span className="truncate">{labels["inbox.category.acceptSuggestion"].replace("{category}", proposal.label)}</span>
            </DropdownMenuItem>
          ) : null}
          {canKeep && currentCategory ? (
            <DropdownMenuItem className={`${itemClassName} font-medium text-[#14203b]`} onSelect={() => void run("KEEP")}>
              <span className="truncate">{labels["inbox.rowActions.keep"].replace("{category}", currentCategory)}</span>
            </DropdownMenuItem>
          ) : null}
          {canChoose ? (
            <DropdownMenuItem asChild className={itemClassName}>
              <Link href={destination}>{labels["inbox.rowActions.chooseCategory"]}</Link>
            </DropdownMenuItem>
          ) : null}
          {canReview ? (
            <DropdownMenuItem className={`${itemClassName} font-medium text-[#14203b]`} onSelect={() => void run("REVIEW_TRANSFER")}>
              {labels["inbox.resolve.reviewTransfer.button"]}
            </DropdownMenuItem>
          ) : null}
          {hasQuickActions ? <DropdownMenuSeparator className="my-1 bg-[#edf0f4]" /> : null}
          <DropdownMenuItem asChild className={itemClassName}>
            <Link href={destination}>{labels["inbox.rowActions.open"]}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={itemClassName}>
            <Link href={`/w/${workspaceSlug}/transactions/${item.transaction.id}`}>
              {labels["inbox.rowActions.viewTransaction"]}
            </Link>
          </DropdownMenuItem>
          {canDismiss ? (
            <>
              <DropdownMenuSeparator className="my-1 bg-[#edf0f4]" />
              <DropdownMenuItem
                className={`${itemClassName} text-[#c0362c] focus:bg-[#fff3f2] focus:text-[#a82a21]`}
                onSelect={() => setConfirmDismiss(true)}>
                {labels["inbox.resolve.dismiss.button"]}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog onOpenChange={(isOpen) => { if (!isOpen && !pending) setConfirmDismiss(false); }} open={confirmDismiss}>
        <ResponsiveDialogContent className="max-w-md gap-0 rounded-[14px] border-[#e3e8ef] p-0" drawerClassName="max-h-[88dvh] rounded-t-[16px]">
          <div className="px-5 pt-5 sm:px-6 sm:pt-6">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#17243e]">
                {labels["inbox.resolve.dismiss.title"]}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#65748b]">
                {labels["inbox.resolve.dismiss.description"]}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>
            <div className="mt-5 flex min-w-0 items-center justify-between gap-3 rounded-[10px] bg-[#f6f8fb] px-3.5 py-3">
              <p className="min-w-0 truncate text-[13px] font-semibold text-[#1d2941]">{merchant}</p>
              <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#26334c]">
                {formatTransactionAmount(item.transaction.amount, item.transaction.kind, locale)}
              </p>
            </div>
          </div>
          <ResponsiveDialogFooter className="mt-5 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
            <Button disabled={pending} onClick={() => setConfirmDismiss(false)} type="button" variant="outline">
              {labels["transactions.actions.cancel"]}
            </Button>
            <Button disabled={pending} onClick={() => void run("DISMISS")} type="button" variant="destructive">
              {pending ? labels["inbox.resolve.dismiss.pending"] : labels["inbox.resolve.dismiss.button"]}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
