"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";

import type { InboxDetailLabels } from "../inbox-detail-labels";

type Action = "REVIEW_TRANSFER" | "DISMISS";

export function InboxItemResolveActions({
  canReviewTransfer,
  canDismiss,
  inboxItemId,
  workspaceId,
  transactionLabel,
  transactionAmount,
  labels,
  cancelLabel,
  reloadLabel,
}: {
  readonly canReviewTransfer: boolean;
  readonly canDismiss: boolean;
  readonly inboxItemId: string;
  readonly workspaceId: string;
  readonly transactionLabel: string;
  readonly transactionAmount: string;
  readonly labels: InboxDetailLabels["resolve"];
  readonly cancelLabel: string;
  readonly reloadLabel: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  if (!canReviewTransfer && !canDismiss) return null;

  const copy = action === "REVIEW_TRANSFER" ? labels.reviewTransfer : action === "DISMISS" ? labels.dismiss : null;

  function open(nextAction: Action) {
    setAction(nextAction);
    setError(null);
    setConflict(false);
  }

  function close() {
    if (pending) return;
    setAction(null);
    setError(null);
    setConflict(false);
  }

  function reloadLatest() {
    if (pending) return;
    close();
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || pending) return;

    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(inboxItemId)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (response.ok) {
        setAction(null);
        router.refresh();
        return;
      }
      if (response.status === 409) {
        setError(labels.conflict);
        setConflict(true);
      } else if ([401, 403, 404].includes(response.status)) {
        setError(labels.notAvailable);
      } else {
        setError(labels.failed);
      }
    } catch {
      setError(labels.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mt-4 flex flex-col gap-2">
        {canReviewTransfer ? (
          <Button className="h-10 w-full gap-2" disabled={pending} onClick={() => open("REVIEW_TRANSFER")} type="button">
            <CheckCheck aria-hidden className="size-4" />
            {labels.reviewTransfer.button}
          </Button>
        ) : null}
        {canDismiss ? (
          <Button
            className="h-10 w-full gap-2 border-[#e3e8ef] text-[#40506c]"
            disabled={pending}
            onClick={() => open("DISMISS")}
            type="button"
            variant="outline">
            <XCircle aria-hidden className="size-4" />
            {labels.dismiss.button}
          </Button>
        ) : null}
      </div>
      <ResponsiveDialog onOpenChange={(isOpen) => { if (!isOpen) close(); }} open={action !== null}>
        <ResponsiveDialogContent className="max-w-md gap-0 rounded-[14px] border-[#e3e8ef] p-0" drawerClassName="max-h-[88dvh] rounded-t-[16px]">
          {action && copy ? (
            <form onSubmit={submit}>
              <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <ResponsiveDialogHeader>
                  <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#17243e]">
                    {copy.title}
                  </ResponsiveDialogTitle>
                  <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#65748b]">
                    {copy.description}
                  </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <div className="mt-5 flex min-w-0 items-center justify-between gap-3 rounded-[10px] bg-[#f6f8fb] px-3.5 py-3">
                  <p className="min-w-0 truncate text-[13px] font-semibold text-[#1d2941]">{transactionLabel}</p>
                  <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#26334c]">{transactionAmount}</p>
                </div>
                {error ? <p className="mt-4 text-[12px] leading-5 text-[#b42318]" role="alert">{error}</p> : null}
                <p aria-live="polite" className="sr-only">{pending ? copy.pending : ""}</p>
              </div>
              <ResponsiveDialogFooter className="mt-5 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
                {conflict ? (
                  <Button disabled={pending} onClick={reloadLatest} type="button">{reloadLabel}</Button>
                ) : (
                  <Button disabled={pending} onClick={close} type="button" variant="outline">{cancelLabel}</Button>
                )}
                <Button
                  disabled={pending || conflict}
                  type="submit"
                  variant={action === "DISMISS" ? "destructive" : "default"}>
                  {pending ? copy.pending : copy.button}
                </Button>
              </ResponsiveDialogFooter>
            </form>
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
