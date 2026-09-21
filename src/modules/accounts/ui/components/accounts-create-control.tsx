"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus, FiX } from "react-icons/fi";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogClose,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/money/currency";
import {
  CreateAccountForm,
  createEmptyCreateAccountFormDraft,
  type CreateAccountFormDraft,
} from "@/modules/ledger/ui/components/create-account-form";
import {
  canAttachCreatedAccountToWorkspace,
  canStartCreateAccountSubmission,
  mapCreateAccountFailure,
  parseCreatedAccountDTO,
  validateCreateAccountForm,
  type CreateAccountFormErrors,
} from "@/modules/ledger/ui/components/create-account-flow";
import type { AccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";

function accountCreationErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function AccountsCreateControl({
  defaultCurrency,
  labels,
  language,
  workspaceId,
}: {
  readonly defaultCurrency: CurrencyCode;
  readonly labels: AccountsUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly workspaceId: string;
}) {
  const router = useRouter();
  const workspaceIdRef = useRef(workspaceId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CreateAccountFormDraft>(() => createEmptyCreateAccountFormDraft(defaultCurrency));
  const [errors, setErrors] = useState<CreateAccountFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const close = () => {
    if (isSubmitting) return;
    setOpen(false);
    setErrors({});
    setFormError(null);
  };

  const updateDraft = (nextDraft: CreateAccountFormDraft) => {
    setDraft(nextDraft);
    setFormError(null);
    if (Object.keys(errors).length) setErrors(validateCreateAccountForm(workspaceId, nextDraft));
  };

  const submit = async () => {
    if (!canStartCreateAccountSubmission(isSubmitting)) return;
    const nextErrors = validateCreateAccountForm(workspaceId, draft);
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;

    const requestWorkspaceId = workspaceId;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/workspaces/${encodeURIComponent(requestWorkspaceId)}/ledger/accounts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          type: draft.type,
          currency: draft.currency,
          openingBalance: draft.openingBalance,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const failure = mapCreateAccountFailure(accountCreationErrorCode(payload));
        if (failure.field) setErrors({ [failure.field]: true });
        else setFormError(failure.code === "WORKSPACE_FORBIDDEN" ? labels.createErrorWorkspaceForbidden : labels.createErrorGeneric);
        return;
      }

      if (!parseCreatedAccountDTO(payload)) {
        setFormError(labels.createErrorGeneric);
        return;
      }
      if (!canAttachCreatedAccountToWorkspace(requestWorkspaceId, workspaceIdRef.current)) {
        setFormError(labels.createErrorWorkspaceChanged);
        router.refresh();
        return;
      }

      setAnnouncement(labels.createSuccess);
      setOpen(false);
      setDraft(createEmptyCreateAccountFormDraft(defaultCurrency));
      setErrors({});
      setFormError(null);
      router.refresh();
    } catch {
      setFormError(labels.createErrorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <p aria-live="polite" className="sr-only" role="status">{announcement}</p>
      <Button className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[12px] font-semibold text-white hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30" onClick={() => setOpen(true)} type="button">
        <FiPlus aria-hidden className="size-4" />{labels.add}
      </Button>
      <ResponsiveDialog onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()} open={open}>
        <ResponsiveDialogContent
          className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
          drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
          showCloseButton={false}
        >
          <ResponsiveDialogClose>
            <Button aria-label={labels.close} className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#15213a] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4" disabled={isSubmitting} size="icon" type="button" variant="ghost">
              <FiX aria-hidden="true" className="size-4.5" />
            </Button>
          </ResponsiveDialogClose>
          <ResponsiveDialogHeader className="gap-1 px-4 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pb-5 sm:pr-14">
            <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">{labels.createTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">{labels.createSubtitle}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
            <CreateAccountForm draft={draft} errors={errors} formError={formError} isSubmitting={isSubmitting} labels={labels.createForm} language={language} onCancel={close} onDraftChange={updateDraft} onSubmit={() => void submit()} />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
