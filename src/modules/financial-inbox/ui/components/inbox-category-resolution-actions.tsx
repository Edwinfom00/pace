"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import type { LedgerCategoryKind } from "@/modules/ledger/domain";
import type { TransactionCategoryOptionsState } from "@/modules/transactions/domain/transaction-category-options";
import { TransactionCategoryField } from "@/modules/transactions/ui/components/transaction-category-field";

import type { InboxCategoryResolutionLabels } from "../inbox-detail-labels";
import {
  canSaveInboxCategorySelection,
  createAcceptInboxCategorySuggestionRequest,
  createChooseInboxCategoryRequest,
  getInboxCategoryResolutionActionVisibility,
  inboxCategoryResolutionErrorCode,
  isInboxCategoryResolutionResponse,
  mapInboxCategoryResolutionFailure,
  type InboxCategoryResolutionError,
} from "../inbox-category-resolution-flow";

type CategoryReference = {
  readonly id: string;
  readonly label: string;
};

type CategorySuggestion = CategoryReference & {
  readonly updatedAt: string;
};

export function InboxCategoryResolutionActions({
  canAcceptCategorySuggestion,
  canChooseCategory,
  categoryKind,
  categoryOptions,
  currentCategory,
  expectedInboxUpdatedAt,
  expectedTransactionUpdatedAt,
  inboxItemId,
  labels,
  suggestion,
  transactionAmount,
  transactionLabel,
  workspaceId,
}: {
  readonly canAcceptCategorySuggestion: boolean;
  readonly canChooseCategory: boolean;
  readonly categoryKind: LedgerCategoryKind | null;
  readonly categoryOptions: TransactionCategoryOptionsState;
  readonly currentCategory: CategoryReference | null;
  readonly expectedInboxUpdatedAt: string;
  readonly expectedTransactionUpdatedAt: string;
  readonly inboxItemId: string;
  readonly labels: InboxCategoryResolutionLabels;
  readonly suggestion: CategorySuggestion | null;
  readonly transactionAmount: string;
  readonly transactionLabel: string;
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const chooseTriggerRef = useRef<HTMLButtonElement>(null);
  const categoryTriggerRef = useRef<HTMLButtonElement>(null);
  const acceptIdempotencyKey = useRef<string | null>(null);
  const chooseIdempotencyKey = useRef<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [activeMutation, setActiveMutation] = useState<"accept" | "choose" | null>(null);
  const [actionError, setActionError] = useState<InboxCategoryResolutionError | null>(null);
  const [dialogError, setDialogError] = useState<InboxCategoryResolutionError | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/inbox/${encodeURIComponent(inboxItemId)}/category`;
  const visibleActions = getInboxCategoryResolutionActionVisibility({
    canAcceptCategorySuggestion,
    canChooseCategory,
    hasSuggestion: suggestion !== null,
  });
  const isBusy = activeMutation !== null || isRefreshing;
  const canSave = categoryKind !== null
    && categoryOptions.status === "ready"
    && canSaveInboxCategorySelection(selectedCategoryId, currentCategory?.id ?? null)
    && dialogError !== "changedSinceOpen";

  if ((!visibleActions.accept && !visibleActions.choose) || categoryKind === null) return null;

  function refreshLatest() {
    startRefresh(() => router.refresh());
  }

  function openDialog() {
    if (!canChooseCategory || isBusy) return;
    setSelectedCategoryId(currentCategory?.id ?? "");
    setDialogError(null);
    setCategoryError(null);
    setActionError(null);
    chooseIdempotencyKey.current = null;
    setDialogOpen(true);
    window.requestAnimationFrame(() => categoryTriggerRef.current?.focus());
  }

  function closeDialog() {
    if (activeMutation === "choose") return;
    setDialogOpen(false);
    setDialogError(null);
    setCategoryError(null);
    chooseIdempotencyKey.current = null;
    window.requestAnimationFrame(() => chooseTriggerRef.current?.focus());
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) openDialog();
    else closeDialog();
  }

  function updateSelection(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setDialogError(null);
    setCategoryError(null);
    chooseIdempotencyKey.current = null;
  }

  async function acceptSuggestion() {
    if (!canAcceptCategorySuggestion || !suggestion || isBusy) return;
    setActiveMutation("accept");
    setActionError(null);
    const idempotencyKey = acceptIdempotencyKey.current ?? window.crypto.randomUUID();
    acceptIdempotencyKey.current = idempotencyKey;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createAcceptInboxCategorySuggestionRequest({
          expectedInboxUpdatedAt,
          expectedTransactionUpdatedAt,
          suggestionCategoryId: suggestion.id,
          suggestionUpdatedAt: suggestion.updatedAt,
        }, idempotencyKey)),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isInboxCategoryResolutionResponse(payload)) {
        applyFailure(inboxCategoryResolutionErrorCode(payload), "accept");
        return;
      }

      acceptIdempotencyKey.current = null;
      refreshLatest();
    } catch {
      setActionError("failed");
    } finally {
      setActiveMutation(null);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canChooseCategory || !canSave || isBusy) return;
    setActiveMutation("choose");
    setDialogError(null);
    setCategoryError(null);
    const idempotencyKey = chooseIdempotencyKey.current ?? window.crypto.randomUUID();
    chooseIdempotencyKey.current = idempotencyKey;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createChooseInboxCategoryRequest({
          categoryId: selectedCategoryId,
          expectedInboxUpdatedAt,
          expectedTransactionUpdatedAt,
        }, idempotencyKey)),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isInboxCategoryResolutionResponse(payload)) {
        applyFailure(inboxCategoryResolutionErrorCode(payload), "choose");
        return;
      }

      chooseIdempotencyKey.current = null;
      setDialogOpen(false);
      refreshLatest();
      window.requestAnimationFrame(() => chooseTriggerRef.current?.focus());
    } catch {
      setDialogError("failed");
    } finally {
      setActiveMutation(null);
    }
  }

  function applyFailure(code: string | undefined, source: "accept" | "choose") {
    const failure = mapInboxCategoryResolutionFailure(code);

    if (failure.error === "category" && source === "choose") {
      setCategoryError(labels.selector.invalid);
    } else if (source === "accept") {
      setActionError(failure.error);
    } else {
      setDialogError(failure.error);
    }

    if (failure.refresh === "automatic") {
      if (source === "choose" && failure.error === null) setDialogOpen(false);
      refreshLatest();
    }
  }

  function reloadAfterConflict(source: "accept" | "choose") {
    if (source === "choose") {
      setDialogOpen(false);
      setActionError("changedSinceOpen");
      window.requestAnimationFrame(() => chooseTriggerRef.current?.focus());
    }
    refreshLatest();
  }

  const actionErrorMessage = resolutionErrorMessage(actionError, labels);
  const dialogErrorMessage = resolutionErrorMessage(dialogError, labels);

  return (
    <>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {visibleActions.choose ? (
          <Button
            className="w-full sm:w-auto"
            disabled={isBusy}
            onClick={openDialog}
            ref={chooseTriggerRef}
            type="button"
            variant="outline"
          >
            {labels.chooseAnother}
          </Button>
        ) : null}
        {visibleActions.accept && suggestion ? (
          <Button
            aria-label={labels.acceptSuggestion.replaceAll("{category}", suggestion.label)}
            className="w-full sm:w-auto"
            disabled={isBusy}
            onClick={() => void acceptSuggestion()}
            type="button"
          >
            {activeMutation === "accept"
              ? labels.accepting
              : labels.acceptSuggestion.replaceAll("{category}", suggestion.label)}
          </Button>
        ) : null}
      </div>

      {actionErrorMessage ? (
        <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-[12px] leading-5 text-[#b42318]">{actionErrorMessage}</p>
          {actionError === "changedSinceOpen" ? (
            <Button disabled={isBusy} onClick={() => reloadAfterConflict("accept")} size="sm" type="button" variant="outline">
              {labels.reloadLatest}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {activeMutation === "accept" ? labels.accepting : isRefreshing ? labels.reloadLatest : ""}
      </p>

      <ResponsiveDialog
        mobilePresentation="dialog"
        onOpenChange={handleDialogOpenChange}
        open={dialogOpen}
      >
        <ResponsiveDialogContent
          className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-hidden rounded-[14px] border-[#e3e8ef] p-0 sm:max-w-lg"
          showCloseButton={false}
        >
          <form className="flex max-h-[90dvh] min-h-0 flex-col" onSubmit={saveCategory}>
            <div className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#17243e]">
                  {labels.dialogTitle}
                </ResponsiveDialogTitle>
                <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#65748b]">
                  {labels.dialogSubtitle}
                </ResponsiveDialogDescription>
              </ResponsiveDialogHeader>

              <div className="mt-4 flex min-w-0 items-center justify-between gap-3 rounded-[10px] bg-[#f6f8fb] px-3.5 py-3">
                <p className="min-w-0 truncate text-[13px] font-semibold text-[#1d2941]">{transactionLabel}</p>
                <p className="shrink-0 text-[13px] font-semibold tabular-nums text-[#26334c]">{transactionAmount}</p>
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto overflow-x-hidden px-5 pb-1 pt-4 sm:px-6">
              {currentCategory || suggestion ? (
                <dl className="mb-4 grid gap-2 rounded-[10px] border border-[#e5eaf1] bg-white px-3.5 py-3 text-[12px]">
                  {currentCategory ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="font-medium text-[#71809a]">{labels.current}</dt>
                      <dd className="min-w-0 truncate font-semibold text-[#34405a]">{currentCategory.label}</dd>
                    </div>
                  ) : null}
                  {suggestion ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="font-medium text-[#4770b8]">{labels.suggested}</dt>
                      <dd className="min-w-0 truncate font-semibold text-[#255fbf]">{suggestion.label}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <TransactionCategoryField
                availability={isRefreshing ? "loading" : categoryOptions.status}
                categories={categoryOptions.categories}
                categoryEmptyLabel={labels.selector.empty}
                categoryLoadError={labels.selector.loadError}
                categoryLoadingLabel={labels.selector.loading}
                categoryRetryLabel={labels.selector.retry}
                error={categoryError ?? undefined}
                helperText={labels.selector.helper}
                kind={categoryKind}
                label={labels.selector.label}
                onRetryCategories={refreshLatest}
                onValueChange={updateSelection}
                placeholder={labels.selector.placeholder}
                searchPlaceholder={labels.selector.search}
                triggerRef={categoryTriggerRef}
                value={selectedCategoryId}
              />

              {dialogErrorMessage ? (
                <p className="pb-3 text-[12px] leading-5 text-[#b42318]" role="alert">
                  {dialogErrorMessage}
                </p>
              ) : null}
              <p aria-live="polite" className="sr-only">
                {activeMutation === "choose" ? labels.saving : isRefreshing ? labels.reloadLatest : ""}
              </p>
            </div>

            <ResponsiveDialogFooter className="mt-4 border-t border-[#edf0f4] px-5 py-4 sm:px-6">
              {dialogError === "changedSinceOpen" ? (
                <Button disabled={isBusy} onClick={() => reloadAfterConflict("choose")} type="button">
                  {labels.reloadLatest}
                </Button>
              ) : (
                <Button disabled={activeMutation === "choose"} onClick={closeDialog} type="button" variant="outline">
                  {labels.cancel}
                </Button>
              )}
              <Button disabled={!canSave || isBusy} type="submit">
                {activeMutation === "choose" ? labels.saving : labels.save}
              </Button>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}

function resolutionErrorMessage(
  error: InboxCategoryResolutionError | null,
  labels: InboxCategoryResolutionLabels,
): string | null {
  switch (error) {
    case "staleSuggestion": return labels.staleSuggestion;
    case "changedSinceOpen": return labels.changedSinceOpen;
    case "notAvailable": return labels.notAvailable;
    case "category": return labels.selector.invalid;
    case "failed": return labels.failed;
    case null: return null;
  }
}
