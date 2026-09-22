"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FiMoreHorizontal } from "react-icons/fi";

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
import { Textarea } from "@/components/ui/textarea";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { RecurringCapabilities } from "@/modules/recurring/domain/recurring-action-policy";

import type { RecurringReviewUiLabels } from "../recurring-review-ui-labels";
import type {
  RecurringCreateAccountOption,
  RecurringCreateCategoryOption,
} from "./recurring-create-flow";
import {
  RecurringEditDialog,
  type RecurringEditTarget,
} from "./recurring-edit-dialog";

type RecurringReviewAction = "CONFIRM" | "IGNORE" | "RESTORE";
type RecurringLifecycleAction = "PAUSE" | "RESUME";
type RecurringMutationAction = RecurringReviewAction | RecurringLifecycleAction;

type RecurringReviewTarget = {
  readonly id: string;
  readonly title: string;
  readonly typicalAmountMinor: string;
  readonly currency: string;
  readonly cadenceDays: number;
  readonly updatedAt: string;
  readonly capabilities: Pick<
    RecurringCapabilities,
    "canConfirm" | "canEdit" | "canIgnore" | "canPause" | "canRestore" | "canResume"
  >;
  /** Detail supplies canonical, authoritative edit fields. Overview intentionally omits this. */
  readonly edit?: Omit<RecurringEditTarget, "id" | "updatedAt">;
};

type EditOptions = {
  readonly accountAvailability: "ready" | "error";
  readonly accounts: readonly RecurringCreateAccountOption[];
  readonly categoryAvailability: "ready" | "error";
  readonly categories: readonly RecurringCreateCategoryOption[];
};

type ApiFailure = { readonly code?: string };

function getIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getReviewCopy(action: RecurringReviewAction, labels: RecurringReviewUiLabels) {
  switch (action) {
    case "CONFIRM": return labels.confirm;
    case "IGNORE": return labels.ignore;
    case "RESTORE": return labels.restore;
  }
}

function getLifecycleCopy(action: RecurringLifecycleAction, labels: RecurringReviewUiLabels) {
  return action === "PAUSE" ? labels.pause : labels.resume;
}

function getActionCopy(action: RecurringMutationAction, labels: RecurringReviewUiLabels) {
  return action === "CONFIRM" || action === "IGNORE" || action === "RESTORE"
    ? getReviewCopy(action, labels)
    : getLifecycleCopy(action, labels);
}

function getActionLabel(action: RecurringMutationAction, labels: RecurringReviewUiLabels): string {
  switch (action) {
    case "CONFIRM": return labels.confirm.submit;
    case "IGNORE": return labels.ignore.submit;
    case "RESTORE": return labels.restore.submit;
    case "PAUSE": return labels.pause.submit;
    case "RESUME": return labels.resume.submit;
  }
}

function mapReviewFailure(code: string | undefined, labels: RecurringReviewUiLabels): string | null {
  switch (code) {
    case "RECURRING_ACTION_NOT_ALLOWED":
    case "RECURRING_PAUSE_NOT_ALLOWED":
    case "RECURRING_RESUME_NOT_ALLOWED":
      return labels.action.notAllowed;
    case "RECURRING_NOT_RESTORABLE": return labels.action.notRestorable;
    case "RECURRING_ACTION_ALREADY_PROCESSED": return labels.action.alreadyProcessed;
    default: return null;
  }
}

function actionFailedCopy(action: RecurringMutationAction, labels: RecurringReviewUiLabels): string {
  switch (action) {
    case "CONFIRM": return labels.confirm.failed;
    case "IGNORE": return labels.ignore.failed;
    case "RESTORE": return labels.restore.failed;
    case "PAUSE": return labels.pause.failed;
    case "RESUME": return labels.resume.failed;
  }
}

function isApiFailure(value: unknown): value is ApiFailure {
  return Boolean(value) && typeof value === "object";
}

export function RecurringReviewActions({
  editOptions,
  labels,
  locale,
  target,
  workspaceId,
}: {
  readonly editOptions?: EditOptions;
  readonly labels: RecurringReviewUiLabels;
  readonly locale: string;
  readonly target: RecurringReviewTarget;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const [action, setAction] = useState<RecurringMutationAction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  const hasReviewActions = target.capabilities.canConfirm
    || target.capabilities.canIgnore
    || target.capabilities.canRestore;
  const hasLifecycleActions = Boolean(
    editOptions
    && target.edit
    && (target.capabilities.canEdit || target.capabilities.canPause || target.capabilities.canResume),
  );
  if (!hasReviewActions && !hasLifecycleActions) return null;

  const copy = action ? getActionCopy(action, labels) : null;
  const amount = formatOverviewMoney(target.typicalAmountMinor, target.currency, locale);
  const cadence = `${amount} · ${labels.cadenceEveryDays.replace("{days}", String(target.cadenceDays))}`;

  function openAction(nextAction: RecurringMutationAction) {
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

  function setEditDialogOpen(open: boolean) {
    setEditOpen(open);
    if (!open) router.refresh();
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
      if (code === "CONCURRENT_MODIFICATION" || code === "RECURRING_NOT_CURRENT") {
        setError(labels.action.conflict);
        setHasConflict(true);
        return;
      }
      if (
        code === "RECURRING_ALREADY_CONFIRMED"
        || code === "RECURRING_ALREADY_IGNORED"
        || code === "RECURRING_ACTION_ALREADY_PROCESSED"
      ) {
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
        <DropdownMenuContent align="end" className="w-52">
          {editOptions && target.edit && target.capabilities.canEdit ? (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>{labels.actions.edit}</DropdownMenuItem>
          ) : null}
          {editOptions && target.edit && target.capabilities.canPause ? (
            <DropdownMenuItem onSelect={() => openAction("PAUSE")}>{labels.actions.pause}</DropdownMenuItem>
          ) : null}
          {editOptions && target.edit && target.capabilities.canResume ? (
            <DropdownMenuItem onSelect={() => openAction("RESUME")}>{labels.actions.resume}</DropdownMenuItem>
          ) : null}
          {hasLifecycleActions && hasReviewActions ? <DropdownMenuSeparator /> : null}
          {target.capabilities.canConfirm ? (
            <DropdownMenuItem onSelect={() => openAction("CONFIRM")}>{labels.actions.confirm}</DropdownMenuItem>
          ) : null}
          {target.capabilities.canIgnore ? (
            <DropdownMenuItem onSelect={() => openAction("IGNORE")}>{labels.actions.ignore}</DropdownMenuItem>
          ) : null}
          {target.capabilities.canRestore ? (
            <DropdownMenuItem onSelect={() => openAction("RESTORE")}>{labels.actions.restore}</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOptions && target.edit && editOpen ? (
        <RecurringEditDialog
          accountAvailability={editOptions.accountAvailability}
          accounts={editOptions.accounts}
          categoryAvailability={editOptions.categoryAvailability}
          categories={editOptions.categories}
          labels={labels}
          locale={locale}
          onOpenChange={setEditDialogOpen}
          open={editOpen}
          target={{ ...target.edit, id: target.id, updatedAt: target.updatedAt }}
          workspaceId={workspaceId}
        />
      ) : null}

      <ResponsiveDialog onOpenChange={(open) => { if (!open) closeDialog(); }} open={action !== null}>
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
                  <p className="truncate text-[13px] font-semibold text-[#1d2941]">{target.title}</p>
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

                {error ? <p className="mt-4 text-[12px] leading-5 text-[#b42318]" role="alert">{error}</p> : null}
                <p aria-live="polite" className="sr-only">{isPending ? copy.pending : ""}</p>
              </div>

              <ResponsiveDialogFooter className="mt-5 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
                {hasConflict ? (
                  <Button disabled={isPending} onClick={reloadLatest} type="button">{labels.action.reloadLatest}</Button>
                ) : (
                  <Button disabled={isPending} onClick={closeDialog} type="button" variant="outline">{labels.actions.cancel}</Button>
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
