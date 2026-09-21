"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FiPlus } from "react-icons/fi";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
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
        <ResponsiveDialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[12px] border border-[#e0e6ef] bg-white p-0 text-[#1c2942] shadow-[0_14px_28px_rgb(16_24_40/0.1)] sm:max-w-2xl" drawerClassName="rounded-t-[16px]">
          <ResponsiveDialogHeader className="border-b border-[#e9edf3] px-5 pt-5 pb-4">
            <ResponsiveDialogTitle className="text-[16px] font-semibold tracking-[-0.018em] text-[#18243d]">{labels.createTitle}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">{labels.createSubtitle}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="max-h-[min(66dvh,620px)] overflow-y-auto px-5 py-5">
            <CreateAccountForm draft={draft} errors={errors} formError={formError} isSubmitting={isSubmitting} labels={labels.createForm} language={language} onCancel={close} onDraftChange={updateDraft} onSubmit={() => void submit()} />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
