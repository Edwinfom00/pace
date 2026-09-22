"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Textarea } from "@/components/ui/textarea";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { RecurringCapabilities } from "@/modules/recurring/domain/recurring-action-policy";

import type { RecurringReviewUiLabels } from "../recurring-review-ui-labels";

type RecurringReviewAction = "CONFIRM" | "IGNORE" | "RESTORE";

type RecurringReviewTarget = {
  readonly id: string;
  readonly title: string;
  readonly typicalAmountMinor: string;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly updatedAt: string;
  readonly capabilities: Pick<
    RecurringCapabilities,
    "canConfirm" | "canIgnore" | "canRestore"
  >;
};

type ApiFailure = {
  readonly code?: string;
};

function getIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getActionCopy(
  action: RecurringReviewAction,
  labels: RecurringReviewUiLabels,
) {
  switch (action) {
    case "CONFIRM":
      return labels.confirm;
    case "IGNORE":
      return labels.ignore;
    case "RESTORE":
      return labels.restore;
  }
}

function getActionLabel(
  action: RecurringReviewAction,
  labels: RecurringReviewUiLabels,
): string {
  switch (action) {
    case "CONFIRM":
      return labels.actions.confirm;
    case "IGNORE":
      return labels.actions.ignore;
    case "RESTORE":
      return labels.actions.restore;
  }
}

function mapReviewFailure(code: string | undefined, labels: RecurringReviewUiLabels): string | null {
  switch (code) {
    case "RECURRING_ACTION_NOT_ALLOWED":
      return labels.action.notAllowed;
    case "RECURRING_NOT_RESTORABLE":
      return labels.action.notRestorable;
    case "RECURRING_ACTION_ALREADY_PROCESSED":
      return labels.action.alreadyProcessed;
    default:
      return null;
  }
}

function actionFailedCopy(action: RecurringReviewAction, labels: RecurringReviewUiLabels): string {
  return getActionCopy(action, labels).failed;
}

function isApiFailure(value: unknown): value is ApiFailure {
  return Boolean(value) && typeof value === "object";
}

export function RecurringReviewActions({
  labels,
  locale,
  target,
  workspaceId,
}: {
  readonly labels: RecurringReviewUiLabels;
  readonly locale: string;
  readonly target: RecurringReviewTarget;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<RecurringReviewAction | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  const hasActions = target.capabilities.canConfirm
    || target.capabilities.canIgnore
    || target.capabilities.canRestore;
  if (!hasActions) return null;

  const copy = action ? getActionCopy(action, labels) : null;
  const amount = formatOverviewMoney(target.typicalAmountMinor, target.currency, locale);
  const cadence = `${amount} · ${labels.cadenceEveryDays.replace("{days}", String(target.cadenceDays))}`;

  function openAction(nextAction: RecurringReviewAction) {
    setAction(nextAction);
    setIdempotencyKey(getIdempotencyKey());
    setReason("");
    setError(null);
    setHasConflict(false);
  }

  function closeDialog() {
    if (isPending) return;
    setAction(null);
    setError(null);
    setHasConflict(false);
  }

  function reloadLatest() {
    if (isPending) return;
    closeDialog();
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || isPending) return;

    setIsPending(true);
    setError(null);
    setHasConflict(false);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/recurring/${encodeURIComponent(target.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expectedUpdatedAt: target.updatedAt,
            idempotencyKey,
            ...(action === "IGNORE" && reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );
      if (response.ok) {
        setAction(null);
        router.refresh();
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const code = isApiFailure(payload) && typeof payload.code === "string"
        ? payload.code
        : undefined;
      if (code === "CONCURRENT_MODIFICATION") {
        setError(labels.action.conflict);
        setHasConflict(true);
        return;
      }
      if (code === "RECURRING_ALREADY_CONFIRMED" || code === "RECURRING_ALREADY_IGNORED") {
        setAction(null);
        router.refresh();
        return;
      }
      setError(mapReviewFailure(code, labels) ?? actionFailedCopy(action, labels));
    } catch {
      setError(actionFailedCopy(action, labels));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={labels.actions.more}
            size="icon-sm"
            title={labels.actions.more}
            type="button"
            variant="ghost">
            <FiMoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {target.capabilities.canConfirm ? (
            <DropdownMenuItem onSelect={() => openAction("CONFIRM")}>
              {labels.actions.confirm}
            </DropdownMenuItem>
          ) : null}
          {target.capabilities.canIgnore ? (
            <DropdownMenuItem onSelect={() => openAction("IGNORE")}>
              {labels.actions.ignore}
            </DropdownMenuItem>
          ) : null}
          {target.capabilities.canRestore ? (
            <DropdownMenuItem onSelect={() => openAction("RESTORE")}>
              {labels.actions.restore}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        open={action !== null}>
        <ResponsiveDialogContent
          className="max-w-md gap-0 rounded-[14px] border-[#e3e8ef] p-0"
          drawerClassName="max-h-[88dvh] rounded-t-[16px]">
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

                <div className="mt-5 rounded-[10px] bg-[#f6f8fb] px-3.5 py-3">
                  <p className="truncate text-[13px] font-semibold text-[#1d2941]">
                    {target.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#728099]">{cadence}</p>
                </div>

                {action === "IGNORE" ? (
                  <label className="mt-4 block text-[12px] font-medium text-[#53627b]">
                    {labels.ignore.reason}
                    <Textarea
                      className="mt-1.5 min-h-20 resize-y border-[#dce3ec] text-[13px]"
                      disabled={isPending}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={labels.ignore.reasonPlaceholder}
                      value={reason}
                    />
                  </label>
                ) : null}

                {error ? (
                  <p className="mt-4 text-[12px] leading-5 text-[#b42318]" role="alert">
                    {error}
                  </p>
                ) : null}
                <p aria-live="polite" className="sr-only">
                  {isPending ? copy.pending : ""}
                </p>
              </div>

              <ResponsiveDialogFooter className="mt-5 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
                {hasConflict ? (
                  <Button disabled={isPending} onClick={reloadLatest} type="button">
                    {labels.action.reloadLatest}
                  </Button>
                ) : (
                  <Button disabled={isPending} onClick={closeDialog} type="button" variant="outline">
                    {labels.actions.cancel}
                  </Button>
                )}
                <Button disabled={isPending || hasConflict} type="submit">
                  {isPending ? copy.pending : getActionLabel(action, labels)}
                </Button>
              </ResponsiveDialogFooter>
            </form>
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
