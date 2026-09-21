"use client";

import { useRef, useState, type RefObject } from "react";
import { Archive, MoreHorizontal, Pencil, RefreshCw, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { AccountDetail } from "../../domain/account-detail";
import type { AccountDetailUiLabels } from "../account-detail-ui-labels";
import {
  accountManagementChanges,
  accountManagementErrorCode,
  createAccountLifecycleRequest,
  createAccountManagementDraft,
  createChangeAccountTypeRequest,
  createRenameAccountRequest,
  mapAccountManagementFailure,
  parseManagedAccountResponse,
  validateAccountManagementDraft,
  type AccountManagementDraft,
  type AccountManagementField,
  type AccountManagementFormError,
  type AccountManagementRequest,
  type AccountManagementSnapshot,
  type ManagedAccountResponse,
} from "./account-management-flow";
import { OpeningBalanceDialog } from "./opening-balance-dialog";
import type { OpeningBalanceMode } from "./opening-balance-flow";

type DialogMode = "edit" | "archive" | "restore" | null;
type Operation = "RENAME" | "CHANGE_TYPE" | "ARCHIVE" | "RESTORE";

export function AccountManagementActions({
  account,
  capabilities,
  currentBalanceMinor,
  labels,
  locale,
  now,
  openingBalance,
  timeZone,
  typeValues,
  workspaceId,
  workspaceSlug,
}: {
  readonly account: AccountDetail["account"];
  readonly capabilities: AccountDetail["capabilities"];
  readonly currentBalanceMinor: string;
  readonly labels: AccountDetailUiLabels["management"];
  readonly locale: string;
  readonly now: string;
  readonly openingBalance: AccountDetail["openingBalance"];
  readonly timeZone: string;
  readonly typeValues: AccountDetailUiLabels["typeValues"];
  readonly workspaceId: string;
  readonly workspaceSlug: string;
}) {
  const router = useRouter();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const idempotencyKeys = useRef<Partial<Record<Operation, string>>>({});
  const [mode, setMode] = useState<DialogMode>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [openingBalanceMode, setOpeningBalanceMode] = useState<OpeningBalanceMode | null>(null);
  const [baseline, setBaseline] = useState<AccountManagementSnapshot>(() => snapshotFor(account));
  const [draft, setDraft] = useState<AccountManagementDraft>(() => createAccountManagementDraft(account));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AccountManagementField, "invalid" | "tooLong" | "server">>>({});
  const [formError, setFormError] = useState<AccountManagementFormError | null>(null);

  const canEdit = capabilities.canRename || capabilities.canChangeType;
  const canArchive = account.status === "ACTIVE" && capabilities.canArchive;
  const canRestore = account.status === "ARCHIVED" && capabilities.canRestore;
  const canSetOpeningBalance = capabilities.canSetOpeningBalance && openingBalance === null;
  const canCorrectOpeningBalance = capabilities.canCorrectOpeningBalance && openingBalance !== null;
  const hasActions = canEdit || canArchive || canRestore || canSetOpeningBalance || canCorrectOpeningBalance;
  const changes = accountManagementChanges(baseline, draft, capabilities);
  const hasChanges = changes.name || changes.type;
  const typeOptions = capabilities.allowedTypeChanges;

  if (!hasActions) return null;

  function resetEdit() {
    setBaseline(snapshotFor(account));
    setDraft(createAccountManagementDraft(account));
    setFieldErrors({});
    setFormError(null);
    idempotencyKeys.current = {};
  }

  function openDialog(nextMode: Exclude<DialogMode, null>) {
    if (isSaving) return;
    if (nextMode === "edit" && !canEdit) return;
    if (nextMode === "archive" && !canArchive) return;
    if (nextMode === "restore" && !canRestore) return;
    resetEdit();
    setMode(nextMode);
    if (nextMode === "edit") {
      window.requestAnimationFrame(() => (
        capabilities.canRename ? nameInputRef.current?.focus() : typeSelectRef.current?.focus()
      ));
    }
  }

  function closeDialog() {
    if (isSaving) return;
    setMode(null);
    resetEdit();
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }

  function updateDraft(change: Partial<AccountManagementDraft>) {
    if (isSaving) return;
    setDraft((current) => ({ ...current, ...change }));
    setFieldErrors({});
    setFormError(null);
    // A changed command needs a fresh idempotency key; unchanged retries keep
    // theirs so an uncertain network response can reconcile safely.
    idempotencyKeys.current = {};
  }

  function operationKey(operation: Operation): string {
    const current = idempotencyKeys.current[operation];
    if (current) return current;
    const key = window.crypto.randomUUID();
    idempotencyKeys.current[operation] = key;
    return key;
  }

  async function request(command: AccountManagementRequest): Promise<
    { readonly ok: true; readonly account: ManagedAccountResponse }
    | { readonly ok: false; readonly code: string | undefined }
  > {
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ledger/accounts/${encodeURIComponent(account.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(command),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const managedAccount = parseManagedAccountResponse(payload);
      if (!response.ok || !managedAccount || managedAccount.id !== account.id) {
        return { ok: false, code: accountManagementErrorCode(payload) };
      }
      return { ok: true, account: managedAccount };
    } catch {
      return { ok: false, code: undefined };
    }
  }

  function applyServerFailure(code: string | undefined) {
    if (code === "ACCOUNT_NOT_FOUND") {
      setMode(null);
      resetEdit();
      router.replace(`/w/${encodeURIComponent(workspaceSlug)}/accounts`);
      return;
    }
    const failure = mapAccountManagementFailure(code);
    setFieldErrors(failure.field ? { [failure.field]: "server" } : {});
    setFormError(failure.formError);
  }

  function applyUpdatedSnapshot(updated: ManagedAccountResponse) {
    setBaseline({ name: updated.name, type: updated.type, updatedAt: updated.updatedAt });
  }

  function finishSuccess() {
    setMode(null);
    setFieldErrors({});
    setFormError(null);
    idempotencyKeys.current = {};
    router.refresh();
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }

  async function saveEdit() {
    if (isSaving || !hasChanges) return;
    const validationErrors = validateAccountManagementDraft(draft, capabilities);
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      return;
    }

    setIsSaving(true);
    setFieldErrors({});
    setFormError(null);
    try {
      // The type operation goes first: it is the most policy-constrained
      // change, avoiding an unrelated rename when a stale policy rejects it.
      let latest = baseline;
      if (changes.type) {
        const result = await request(
          createChangeAccountTypeRequest(
            draft.type,
            latest.updatedAt,
            operationKey("CHANGE_TYPE"),
          ),
        );
        if (!result.ok) {
          applyServerFailure(result.code);
          return;
        }
        latest = { name: result.account.name, type: result.account.type, updatedAt: result.account.updatedAt };
        applyUpdatedSnapshot(result.account);
      }

      if (changes.name) {
        const result = await request(
          createRenameAccountRequest(
            draft.name,
            latest.updatedAt,
            operationKey("RENAME"),
          ),
        );
        if (!result.ok) {
          applyServerFailure(result.code);
          return;
        }
        applyUpdatedSnapshot(result.account);
      }

      finishSuccess();
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmLifecycle(action: "ARCHIVE" | "RESTORE") {
    if (isSaving) return;
    setIsSaving(true);
    setFormError(null);
    try {
      const result = await request(
        createAccountLifecycleRequest(action, account.updatedAt, operationKey(action)),
      );
      if (!result.ok) {
        applyServerFailure(result.code);
        return;
      }
      finishSuccess();
    } finally {
      setIsSaving(false);
    }
  }

  function reloadLatest() {
    if (isSaving) return;
    setMode(null);
    resetEdit();
    router.refresh();
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }

  function closeOpeningBalanceDialog() {
    setOpeningBalanceMode(null);
    window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={labels.actions.more}
            className="size-9 rounded-[8px] border border-[#dfe5ee] bg-white text-[#53627b] hover:bg-[#f6f8fb] hover:text-[#243451] focus-visible:ring-[#5e8fe8]/35"
            ref={menuTriggerRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
          {canEdit ? (
            <DropdownMenuItem
              className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
              onSelect={() => openDialog("edit")}
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              {labels.actions.edit}
            </DropdownMenuItem>
          ) : null}
          {canSetOpeningBalance ? (
            <DropdownMenuItem
              className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
              onSelect={() => setOpeningBalanceMode("set")}
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              {labels.openingBalance.setAction}
            </DropdownMenuItem>
          ) : null}
          {canCorrectOpeningBalance ? (
            <DropdownMenuItem
              className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
              onSelect={() => setOpeningBalanceMode("correct")}
            >
              <Pencil aria-hidden="true" className="size-3.5" />
              {labels.openingBalance.correctAction}
            </DropdownMenuItem>
          ) : null}
          {canArchive ? (
            <DropdownMenuItem
              className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
              onSelect={() => openDialog("archive")}
            >
              <Archive aria-hidden="true" className="size-3.5" />
              {labels.actions.archive}
            </DropdownMenuItem>
          ) : null}
          {canRestore ? (
            <DropdownMenuItem
              className="gap-2 rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]"
              onSelect={() => openDialog("restore")}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              {labels.actions.restore}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog onOpenChange={(open) => open || closeDialog()} open={mode !== null}>
        <ResponsiveDialogContent
          className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-120 flex-col gap-0 overflow-y-auto rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-120"
          drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]"
          showCloseButton={false}
        >
          <Button
            aria-label={labels.actions.close}
            className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30"
            disabled={isSaving}
            onClick={closeDialog}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>

          {mode === "edit" ? (
            <EditAccountDialog
              capabilities={capabilities}
              draft={draft}
              fieldErrors={fieldErrors}
              formError={formError}
              hasChanges={hasChanges}
              isSaving={isSaving}
              labels={labels}
              nameInputRef={nameInputRef}
              onCancel={closeDialog}
              onDraftChange={updateDraft}
              onReloadLatest={reloadLatest}
              onSave={saveEdit}
              typeOptions={typeOptions}
              typeSelectRef={typeSelectRef}
              typeValues={typeValues}
              account={account}
            />
          ) : mode === "archive" ? (
            <LifecycleDialog
              account={account}
              balance={formatOverviewMoney(currentBalanceMinor, account.currency, locale)}
              formError={formError}
              isSaving={isSaving}
              kind="archive"
              labels={labels}
              onCancel={closeDialog}
              onConfirm={() => confirmLifecycle("ARCHIVE")}
              onReloadLatest={reloadLatest}
            />
          ) : mode === "restore" ? (
            <LifecycleDialog
              account={account}
              formError={formError}
              isSaving={isSaving}
              kind="restore"
              labels={labels}
              onCancel={closeDialog}
              onConfirm={() => confirmLifecycle("RESTORE")}
              onReloadLatest={reloadLatest}
            />
          ) : null}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      {openingBalanceMode ? (
        <OpeningBalanceDialog
          account={account}
          key={`${openingBalanceMode}:${openingBalance?.updatedAt ?? "new"}`}
          labels={labels.openingBalance}
          locale={locale}
          mode={openingBalanceMode}
          now={now}
          onClose={closeOpeningBalanceDialog}
          openingBalance={openingBalance}
          timeZone={timeZone}
          workspaceId={workspaceId}
        />
      ) : null}
    </>
  );
}

function EditAccountDialog({
  account,
  capabilities,
  draft,
  fieldErrors,
  formError,
  hasChanges,
  isSaving,
  labels,
  nameInputRef,
  onCancel,
  onDraftChange,
  onReloadLatest,
  onSave,
  typeOptions,
  typeSelectRef,
  typeValues,
}: {
  readonly account: AccountDetail["account"];
  readonly capabilities: AccountDetail["capabilities"];
  readonly draft: AccountManagementDraft;
  readonly fieldErrors: Partial<Record<AccountManagementField, "invalid" | "tooLong" | "server">>;
  readonly formError: AccountManagementFormError | null;
  readonly hasChanges: boolean;
  readonly isSaving: boolean;
  readonly labels: AccountDetailUiLabels["management"];
  readonly nameInputRef: RefObject<HTMLInputElement | null>;
  readonly onCancel: () => void;
  readonly onDraftChange: (change: Partial<AccountManagementDraft>) => void;
  readonly onReloadLatest: () => void;
  readonly onSave: () => void;
  readonly typeOptions: readonly AccountDetail["account"]["type"][];
  readonly typeSelectRef: RefObject<HTMLSelectElement | null>;
  readonly typeValues: AccountDetailUiLabels["typeValues"];
}) {
  const nameError = fieldErrors.name === "tooLong"
    ? labels.edit.nameTooLong
    : fieldErrors.name
      ? labels.edit.invalidName
      : null;
  const typeError = fieldErrors.type ? labels.edit.notAllowed : null;
  const typeReason = typePolicyReason(capabilities.reasons.changeType, labels);
  const formMessage = editFormMessage(formError, labels);
  const needsReload = formError === "conflict" || formError === "notAllowed";

  return (
    <>
      <ResponsiveDialogHeader className="gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-12 sm:px-6 sm:pt-6 sm:pr-14">
        <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">{labels.edit.title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">{labels.edit.description}</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <form
        className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6"
        noValidate
        onSubmit={(event) => { event.preventDefault(); onSave(); }}
      >
        <div className="grid gap-2">
          <label className="text-[13px] font-medium text-[#384862]" htmlFor="account-management-name">
            {labels.edit.name}
          </label>
          {capabilities.canRename ? (
            <Input
              aria-describedby={nameError ? "account-management-name-error" : undefined}
              aria-invalid={nameError ? true : undefined}
              autoComplete="off"
              className="h-11 rounded-[8px] border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
              disabled={isSaving}
              id="account-management-name"
              maxLength={120}
              onChange={(event) => onDraftChange({ name: event.target.value })}
              ref={nameInputRef}
              required
              value={draft.name}
            />
          ) : (
            <ReadOnlyField value={account.name} />
          )}
          {nameError ? <p className="text-[12px] leading-5 text-[#c23445]" id="account-management-name-error" role="alert">{nameError}</p> : null}
          {!capabilities.canRename ? <p className="text-[12px] leading-5 text-[#71809a]">{typePolicyReason(capabilities.reasons.rename, labels)}</p> : null}
        </div>

        <div className="grid gap-2">
          <label className="text-[13px] font-medium text-[#384862]" htmlFor="account-management-type">{labels.edit.type}</label>
          {capabilities.canChangeType ? (
            <select
              aria-describedby={typeError ? "account-management-type-error" : undefined}
              aria-invalid={typeError ? true : undefined}
              className="h-11 w-full rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
              disabled={isSaving}
              id="account-management-type"
              onChange={(event) => onDraftChange({ type: event.target.value as AccountDetail["account"]["type"] })}
              ref={typeSelectRef}
              value={draft.type}
            >
              {typeOptions.map((type) => <option key={type} value={type}>{typeValues[type]}</option>)}
            </select>
          ) : (
            <ReadOnlyField value={typeValues[account.type]} />
          )}
          {typeError ? <p className="text-[12px] leading-5 text-[#c23445]" id="account-management-type-error" role="alert">{typeError}</p> : null}
          {!capabilities.canChangeType && typeReason ? <p className="text-[12px] leading-5 text-[#71809a]">{typeReason}</p> : null}
        </div>

        <div className="grid gap-2">
          <span className="text-[13px] font-medium text-[#384862]">{labels.edit.currency}</span>
          <ReadOnlyField value={account.currency} />
          <p className="text-[12px] leading-5 text-[#71809a]">{labels.edit.currencyLocked}</p>
        </div>

        <EditStatusMessage message={formMessage} onReloadLatest={onReloadLatest} reloadable={needsReload} reloadLabel={labels.edit.reloadLatest} />
        <p aria-live="polite" className="sr-only">{isSaving ? labels.edit.saving : ""}</p>
        <footer className="-mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSaving} onClick={onCancel} type="button" variant="ghost">
            {labels.actions.cancel}
          </Button>
          <Button
            aria-busy={isSaving || undefined}
            className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving || !hasChanges || needsReload}
            type="submit"
          >
            {isSaving ? labels.edit.saving : labels.edit.save}
          </Button>
        </footer>
        {!hasChanges && !isSaving ? <p className="-mt-2 text-[12px] text-[#71809a]">{labels.edit.noChanges}</p> : null}
      </form>
    </>
  );
}

function LifecycleDialog({
  account,
  balance,
  formError,
  isSaving,
  kind,
  labels,
  onCancel,
  onConfirm,
  onReloadLatest,
}: {
  readonly account: AccountDetail["account"];
  readonly balance?: string;
  readonly formError: AccountManagementFormError | null;
  readonly isSaving: boolean;
  readonly kind: "archive" | "restore";
  readonly labels: AccountDetailUiLabels["management"];
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onReloadLatest: () => void;
}) {
  const copy = kind === "archive" ? labels.archive : labels.restore;
  const formMessage = lifecycleFormMessage(formError, kind, labels);
  const needsReload = formError === "conflict" || formError === "notAllowed";
  const pendingLabel = kind === "archive" ? labels.archive.archiving : labels.restore.restoring;

  return (
    <>
      <ResponsiveDialogHeader className="gap-1 border-b border-[#e8edf4] px-5 pt-5 pb-4 pr-12 sm:px-6 sm:pt-6 sm:pr-14">
        <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">{copy.title}</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">{copy.description}</ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <div className="grid gap-4 px-5 py-5 sm:px-6 sm:py-6">
        {kind === "archive" ? (
          <section aria-label={account.name} className="rounded-[10px] border border-[#e5eaf1] bg-[#f8fafc] px-4 py-3.5">
            <p className="min-w-0 wrap-break-word text-[14px] font-semibold text-[#1b2b48]">{account.name}</p>
            <dl className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-[12px] text-[#71809a]">{labels.archive.currentBalance}</dt>
              <dd className="text-[15px] font-semibold tabular-nums text-[#1b2b48]">{balance}</dd>
            </dl>
          </section>
        ) : null}
        {kind === "archive" ? <p className="text-[13px] leading-5 text-[#53627b]">{labels.archive.historyPreserved}</p> : null}
        <EditStatusMessage message={formMessage} onReloadLatest={onReloadLatest} reloadable={needsReload} reloadLabel={labels.edit.reloadLatest} />
        <p aria-live="polite" className="sr-only">{isSaving ? pendingLabel : ""}</p>
        <footer className="-mx-5 -mb-5 mt-1 flex flex-col-reverse gap-2 border-t border-[#e8edf4] bg-[#fcfdff] px-5 py-3 sm:-mx-6 sm:-mb-6 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button className="h-10 rounded-[8px] px-4 text-[13px] font-medium text-[#43516a]" disabled={isSaving} onClick={onCancel} type="button" variant="ghost">
            {labels.actions.cancel}
          </Button>
          <Button
            aria-busy={isSaving || undefined}
            className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white hover:bg-[#1e55d1] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving || needsReload}
            onClick={onConfirm}
            type="button"
          >
            {isSaving ? pendingLabel : copy.confirm}
          </Button>
        </footer>
      </div>
    </>
  );
}

function ReadOnlyField({ value }: { readonly value: string }) {
  return <p className="min-h-11 wrap-break-word rounded-[8px] border border-[#e5eaf1] bg-[#f8fafc] px-3 py-3 text-[13px] font-medium text-[#34405d]">{value}</p>;
}

function EditStatusMessage({
  message,
  onReloadLatest,
  reloadable,
  reloadLabel,
}: {
  readonly message: string | null;
  readonly onReloadLatest: () => void;
  readonly reloadable: boolean;
  readonly reloadLabel: string;
}) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] bg-[#fff6ed] px-3.5 py-3 text-[12px] leading-5 text-[#8a4d18]" role="alert">
      <span>{message}</span>
      {reloadable ? (
        <button className="inline-flex items-center gap-1 font-semibold underline underline-offset-3 outline-none focus-visible:ring-2 focus-visible:ring-[#d98c3c]/40" onClick={onReloadLatest} type="button">
          <RefreshCw aria-hidden="true" className="size-3" />
          {reloadLabel}
        </button>
      ) : null}
    </div>
  );
}

function editFormMessage(
  error: AccountManagementFormError | null,
  labels: AccountDetailUiLabels["management"],
): string | null {
  switch (error) {
    case "conflict": return labels.edit.conflict;
    case "notAllowed": return labels.edit.notAllowed;
    case "failed": return labels.edit.failed;
    default: return null;
  }
}

function lifecycleFormMessage(
  error: AccountManagementFormError | null,
  kind: "archive" | "restore",
  labels: AccountDetailUiLabels["management"],
): string | null {
  if (error === "conflict" || error === "notAllowed") return labels.edit.conflict;
  if (error === "failed") return kind === "archive" ? labels.archive.failed : labels.restore.failed;
  return null;
}

function typePolicyReason(
  reason: AccountDetail["capabilities"]["reasons"]["changeType"] | AccountDetail["capabilities"]["reasons"]["rename"],
  labels: AccountDetailUiLabels["management"],
): string | null {
  switch (reason) {
    case "ACCOUNT_HAS_FINANCIAL_ACTIVITY": return labels.edit.typeLocked;
    case "ACCOUNT_TYPE_TRANSITION_UNSUPPORTED": return labels.edit.typeTransitionLocked;
    case "READ_ONLY_ROLE": return labels.edit.readOnly;
    default: return null;
  }
}

function snapshotFor(account: AccountDetail["account"]): AccountManagementSnapshot {
  return { name: account.name, type: account.type, updatedAt: account.updatedAt };
}
