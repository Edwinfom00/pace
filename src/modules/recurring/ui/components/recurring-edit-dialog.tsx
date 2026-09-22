"use client";

import { useRef, useState } from "react";
import { FiCalendar, FiCreditCard, FiTag, FiX } from "react-icons/fi";

import { PaceMoneyInput } from "@/components/pace/forms/pace-money-input";
import {
  PaceSearchSelect,
  type SelectOption,
} from "@/components/pace/forms/pace-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { RecurringManagementUiLabels } from "../recurring-review-ui-labels";
import {
  createRecurringEditDraft,
  createRecurringEditPatch,
  hasRecurringEditChanges,
  mapRecurringEditFailure,
  validateRecurringEditDraft,
  type RecurringEditErrors,
  type RecurringEditSource,
} from "./recurring-edit-flow";
import {
  recurringFrequencyOptions,
  type RecurringCreateAccountOption,
  type RecurringCreateCategoryOption,
} from "./recurring-create-flow";

export type RecurringEditTarget = RecurringEditSource & {
  readonly accountName: string | null;
  readonly categoryName: string | null;
  readonly direction: "EXPENSE" | "INCOME";
  readonly id: string;
  readonly updatedAt: string;
};

type ApiFailure = { readonly code?: string };

function isApiFailure(value: unknown): value is ApiFailure {
  return Boolean(value) && typeof value === "object";
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurring-edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function FieldMessage({ error, helper }: { readonly error?: string; readonly helper?: string }) {
  return (
    <p
      aria-live={error ? "assertive" : undefined}
      className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`}
      role={error ? "alert" : undefined}>
      {error ?? helper}
    </p>
  );
}

function fieldError(
  field: keyof RecurringEditErrors,
  errors: RecurringEditErrors,
  labels: RecurringManagementUiLabels,
): string | undefined {
  if (!errors[field]) return undefined;
  switch (field) {
    case "name": return labels.edit.validation.name;
    case "amount": return labels.edit.validation.amount;
    case "cadenceDays": return labels.edit.validation.frequency;
    case "nextOccurrence": return labels.edit.validation.nextOccurrence;
    case "account": return labels.edit.validation.account;
    case "category": return labels.edit.validation.category;
  }
}

function frequencyOptions(labels: RecurringManagementUiLabels): SelectOption[] {
  const labelByKey = {
    weekly: labels.edit.frequencyWeekly,
    biweekly: labels.edit.frequencyBiweekly,
    monthly: labels.edit.frequencyMonthly,
    quarterly: labels.edit.frequencyQuarterly,
    yearly: labels.edit.frequencyYearly,
  };
  return recurringFrequencyOptions.map((option) => ({
    label: labelByKey[option.key],
    value: String(option.cadenceDays),
  }));
}

function typeLabel(
  direction: RecurringEditTarget["direction"],
  labels: RecurringManagementUiLabels,
): string {
  return direction === "INCOME" ? labels.edit.typeIncome : labels.edit.typeExpense;
}

export function RecurringEditDialog({
  accountAvailability,
  accounts,
  categoryAvailability,
  categories,
  labels,
  locale,
  onOpenChange,
  open,
  target,
  workspaceId,
}: {
  readonly accountAvailability: "ready" | "error";
  readonly accounts: readonly RecurringCreateAccountOption[];
  readonly categoryAvailability: "ready" | "error";
  readonly categories: readonly RecurringCreateCategoryOption[];
  readonly labels: RecurringManagementUiLabels;
  readonly locale: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly target: RecurringEditTarget;
  readonly workspaceId: string;
}) {
  const source: RecurringEditSource = target;
  const [draft, setDraft] = useState(() => createRecurringEditDraft(source));
  const [errors, setErrors] = useState<RecurringEditErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const availableAccounts = accountAvailability === "ready" ? accounts : [];
  const availableCategories = categoryAvailability === "ready" ? categories : [];
  const accountOptions = target.accountId && !availableAccounts.some((account) => account.id === target.accountId)
    ? [{
      id: target.accountId,
      name: target.accountName ?? labels.edit.currentAccount,
      currency: target.currency,
    }, ...availableAccounts]
    : availableAccounts;
  const categoryOptions = target.categoryId && !availableCategories.some((category) => category.id === target.categoryId)
    ? [{
      id: target.categoryId,
      name: target.categoryName ?? labels.edit.currentCategory,
      kind: target.direction,
      systemKey: null,
    }, ...availableCategories]
    : availableCategories;
  const eligibleCategories = categoryOptions.filter((category) => category.kind === target.direction);
  const dirty = hasRecurringEditChanges(source, draft);

  function updateDraft(patch: Partial<typeof draft>) {
    if (pending) return;
    idempotencyKey.current = null;
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
    setFormError(null);
    setHasConflict(false);
  }

  function requestClose(nextOpen: boolean) {
    if (!nextOpen && !pending) onOpenChange(false);
  }

  function reloadLatest() {
    if (!pending) onOpenChange(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;

    const validation = validateRecurringEditDraft(
      source,
      draft,
      accountOptions,
      categoryOptions,
      target.direction,
    );
    if (Object.keys(validation).length) {
      setErrors(validation);
      return;
    }

    const patch = createRecurringEditPatch(source, draft);
    if (!Object.keys(patch).length) return;

    setPending(true);
    setErrors({});
    setFormError(null);
    setHasConflict(false);
    const key = idempotencyKey.current ?? createIdempotencyKey();
    idempotencyKey.current = key;
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/recurring/${encodeURIComponent(target.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "UPDATE",
            expectedUpdatedAt: target.updatedAt,
            idempotencyKey: key,
            ...patch,
          }),
        },
      );
      if (response.ok) {
        onOpenChange(false);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const code = isApiFailure(payload) && typeof payload.code === "string" ? payload.code : undefined;
      if (code === "RECURRING_ACTION_ALREADY_PROCESSED") {
        onOpenChange(false);
        return;
      }
      const failure = mapRecurringEditFailure(code);
      if (failure.field) setErrors({ [failure.field]: true });
      if (failure.form === "conflict") {
        setFormError(labels.action.conflict);
        setHasConflict(true);
      } else if (failure.form === "currency") {
        setFormError(labels.edit.currencyMismatch);
      } else if (failure.form === "notAllowed") {
        setFormError(labels.edit.notAllowed);
      } else if (!failure.field) {
        setFormError(labels.edit.failed);
      }
    } catch {
      setFormError(labels.edit.failed);
    } finally {
      setPending(false);
    }
  }

  const accountSelectOptions: SelectOption[] = accountOptions.map((account) => ({
    description: account.availableBalanceMinor === undefined
      ? account.currency
      : `${labels.edit.available} · ${formatOverviewMoney(account.availableBalanceMinor, account.currency, locale)}`,
    label: account.name,
    value: account.id,
  }));
  const categorySelectOptions: SelectOption[] = eligibleCategories.map((category) => ({
    label: category.name,
    value: category.id,
  }));

  return (
    <ResponsiveDialog onOpenChange={requestClose} open={open}>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]">
        <Button
          aria-label={labels.edit.close}
          className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4"
          disabled={pending}
          onClick={() => requestClose(false)}
          size="icon"
          type="button"
          variant="ghost">
          <FiX aria-hidden="true" className="size-4.5" />
        </Button>
        <ResponsiveDialogHeader className="gap-1 px-4 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pb-5 sm:pr-14">
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {labels.edit.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {labels.edit.futureOnly}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <form className="min-h-0 flex flex-1 flex-col" onSubmit={submit}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
            <dl className="grid grid-cols-2 gap-3 rounded-[10px] border border-[#e3e9f2] bg-[#fbfcfe] px-3.5 py-3 text-[12px] sm:grid-cols-3">
              <div>
                <dt className="text-[#71809a]">{labels.edit.type}</dt>
                <dd className="mt-0.5 font-medium text-[#263550]">{typeLabel(target.direction, labels)}</dd>
              </div>
              <div>
                <dt className="text-[#71809a]">{labels.edit.currency}</dt>
                <dd className="mt-0.5 font-medium text-[#263550]">{target.currency}</dd>
              </div>
            </dl>
            <div className="mt-5 space-y-5">
              <div className="grid gap-2">
                <label className="text-[13px] font-medium text-[#384862]" htmlFor="recurring-edit-name">
                  {labels.edit.name}
                </label>
                <Input
                  aria-invalid={Boolean(errors.name) || undefined}
                  className={`h-11 rounded-[8px] bg-white px-3 text-[13px] text-[#13213f] placeholder:text-[#8a9ab3] hover:border-[#bac9df] focus-visible:ring-3 ${errors.name ? "border-[#d88690] focus-visible:border-[#c55b68] focus-visible:ring-[#d88690]/15" : "border-[#d9e1ec] focus-visible:border-[#4e7fe3] focus-visible:ring-[#5e8fe8]/15"}`}
                  disabled={pending}
                  id="recurring-edit-name"
                  maxLength={160}
                  onChange={(event) => updateDraft({ name: event.target.value })}
                  value={draft.name}
                />
                <FieldMessage error={fieldError("name", errors, labels)} />
              </div>
              <PaceMoneyInput
                currency={target.currency}
                disabled={pending}
                error={fieldError("amount", errors, labels)}
                helperText={labels.edit.amountHelper}
                label={labels.edit.amount}
                onValueChange={(amount) => updateDraft({ amount })}
                value={draft.amount}
              />
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <label className="text-[13px] font-medium text-[#384862]">{labels.edit.frequency}</label>
                  <PaceSearchSelect
                    ariaLabel={labels.edit.frequency}
                    emptyLabel={labels.edit.frequencyPlaceholder}
                    invalid={Boolean(errors.cadenceDays)}
                    onValueChange={(value) => updateDraft({ cadenceDays: Number(value) })}
                    options={frequencyOptions(labels)}
                    placeholder={labels.edit.frequencyPlaceholder}
                    searchPlaceholder={labels.edit.frequencyPlaceholder}
                    triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
                    value={String(draft.cadenceDays)}
                  />
                  <FieldMessage error={fieldError("cadenceDays", errors, labels)} />
                </div>
                <div className="grid min-w-0 gap-2">
                  <label className="text-[13px] font-medium text-[#384862]" htmlFor="recurring-edit-next-occurrence">
                    {labels.edit.nextOccurrence}
                  </label>
                  <div className={`flex h-11 items-center gap-2 rounded-[8px] border bg-white px-3 transition-[border-color,box-shadow] focus-within:ring-3 ${errors.nextOccurrence ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
                    <FiCalendar aria-hidden="true" className="size-4 shrink-0 text-[#60769e]" />
                    <input
                      aria-invalid={Boolean(errors.nextOccurrence) || undefined}
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-[#13213f] outline-none"
                      disabled={pending}
                      id="recurring-edit-next-occurrence"
                      onChange={(event) => updateDraft({ nextOccurrence: event.target.value })}
                      type="date"
                      value={draft.nextOccurrence}
                    />
                  </div>
                  <FieldMessage error={fieldError("nextOccurrence", errors, labels)} />
                </div>
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <label className="text-[13px] font-medium text-[#384862]">{labels.edit.account}</label>
                  {accountSelectOptions.length ? (
                    <PaceSearchSelect
                      ariaLabel={labels.edit.account}
                      emptyLabel={labels.edit.accountEmpty}
                      invalid={Boolean(errors.account)}
                      onValueChange={(accountId) => updateDraft({ accountId })}
                      options={accountSelectOptions}
                      placeholder={labels.edit.accountPlaceholder}
                      renderOption={(option) => (
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#edf3ff] text-[#356fe0]">
                            <FiCreditCard aria-hidden="true" className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">{option.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#71809a]">{option.description}</span>
                          </span>
                        </span>
                      )}
                      searchPlaceholder={labels.edit.accountSearch}
                      triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
                      value={draft.accountId}
                    />
                  ) : (
                    <div className="flex h-11 items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-[13px] text-[#71809a]">
                      {labels.edit.accountEmpty}
                    </div>
                  )}
                  <FieldMessage error={fieldError("account", errors, labels)} />
                </div>
                <div className="grid min-w-0 gap-2">
                  <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]">
                    <span>{labels.edit.category}</span>
                    <span className="text-[12px] font-normal text-[#71809a]">{labels.edit.categoryOptional}</span>
                  </label>
                  {categorySelectOptions.length ? (
                    <PaceSearchSelect
                      ariaLabel={labels.edit.category}
                      emptyLabel={labels.edit.categoryEmpty}
                      invalid={Boolean(errors.category)}
                      onValueChange={(categoryId) => updateDraft({ categoryId })}
                      options={categorySelectOptions}
                      placeholder={labels.edit.categoryPlaceholder}
                      renderValue={(option) => (
                        <span className="flex min-w-0 items-center gap-2">
                          <FiTag aria-hidden="true" className="size-3.5 shrink-0 text-[#60769e]" />
                          <span className="truncate">{option.label}</span>
                        </span>
                      )}
                      searchPlaceholder={labels.edit.categorySearch}
                      triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
                      value={draft.categoryId}
                    />
                  ) : (
                    <div className="flex h-11 items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-[13px] text-[#71809a]">
                      {labels.edit.categoryEmpty}
                    </div>
                  )}
                  <FieldMessage error={fieldError("category", errors, labels)} />
                </div>
              </div>
              {formError ? <p className="text-[12px] leading-5 text-[#c23445]" role="alert">{formError}</p> : null}
            </div>
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
            {hasConflict ? (
              <Button disabled={pending} onClick={reloadLatest} type="button">
                {labels.action.reloadLatest}
              </Button>
            ) : (
              <Button
                className="h-10 rounded-[8px] px-3.5 text-[13px] text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:h-9"
                disabled={pending}
                onClick={() => requestClose(false)}
                type="button"
                variant="ghost">
                {labels.actions.cancel}
              </Button>
            )}
            <Button
              aria-busy={pending || undefined}
              className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
              disabled={pending || hasConflict || !dirty}
              title={!dirty ? labels.edit.noChanges : undefined}
              type="submit">
              {pending ? labels.edit.saving : labels.edit.save}
            </Button>
          </footer>
        </form>
        <p aria-live="polite" className="sr-only">{pending ? labels.edit.saving : ""}</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
