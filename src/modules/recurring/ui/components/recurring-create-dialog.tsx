"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FiArrowLeft,
  FiCalendar,
  FiCreditCard,
  FiTag,
  FiX,
} from "react-icons/fi";

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
import type { CurrencyCode } from "@/money/currency";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";

import type { RecurringUiLabels } from "../recurring-ui-labels";
import {
  compatibleRecurringCategories,
  createRecurringDraft,
  mapRecurringCreateFailure,
  nextOccurrenceIso,
  recurringFrequencyOptions,
  type RecurringCreateAccountOption,
  type RecurringCreateCategoryOption,
  type RecurringCreateDraft,
  type RecurringCreateErrorCode,
  type RecurringCreateErrors,
  validateRecurringDraft,
} from "./recurring-create-flow";
import { RecurringTypeSelector } from "./recurring-type-selector";

type RecurringCreateDialogProps = {
  readonly accounts: readonly RecurringCreateAccountOption[];
  readonly accountAvailability: "ready" | "error";
  readonly categories: readonly RecurringCreateCategoryOption[];
  readonly categoryAvailability: "ready" | "error";
  readonly defaultCurrency: CurrencyCode;
  readonly defaultNextOccurrence: string;
  readonly labels: RecurringUiLabels;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly workspaceId: string;
};

type CreateResponse = { readonly payment: { readonly id: string } };

function isCreateResponse(value: unknown): value is CreateResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "payment" in value &&
    typeof (value as { payment?: { id?: unknown } }).payment?.id === "string"
  );
}

function readErrorCode(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string"
    ? (value as { code: string }).code
    : undefined;
}

function validationMessage(
  labels: RecurringUiLabels,
  code: RecurringCreateErrorCode | undefined,
): string | undefined {
  return code ? labels.create.validation[code] : undefined;
}

function fieldErrorForServerCode(
  code: string | undefined,
): RecurringCreateErrorCode {
  switch (code) {
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE":
      return "accountUnavailable";
    case "CATEGORY_NOT_FOUND":
    case "INVALID_RECURRING_CATEGORY":
      return "categoryUnavailable";
    case "INVALID_RECURRING_SOURCE":
      return "identityTooLong";
    case "INVALID_RECURRING_NAME":
      return "nameRequired";
    case "INVALID_RECURRING_FREQUENCY":
      return "frequency";
    case "INVALID_NEXT_OCCURRENCE":
      return "nextOccurrence";
    case "INVALID_RECURRING_AMOUNT":
    case "INVALID_RECURRING_CURRENCY":
    case "CURRENCY_MISMATCH":
      return "amountInvalid";
    default:
      return "amountInvalid";
  }
}

function FieldMessage({
  error,
  helper,
}: {
  readonly error?: string;
  readonly helper?: string;
}) {
  return (
    <p
      aria-live={error ? "assertive" : undefined}
      className={`min-h-5 text-[12px] leading-5 ${error ? "text-[#c23445]" : "text-[#71809a]"}`}
      role={error ? "alert" : undefined}>
      {error ?? helper}
    </p>
  );
}

function TextField({
  error,
  helper,
  label,
  onValueChange,
  placeholder,
  value,
}: {
  readonly error?: string;
  readonly helper?: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  const id = `${label.toLocaleLowerCase().replaceAll(/\W+/g, "-")}-field`;
  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={id}>
        {label}
      </label>
      <Input
        aria-invalid={Boolean(error) || undefined}
        className={`h-11 rounded-[8px] bg-white px-3 text-[13px] text-[#13213f] placeholder:text-[#8a9ab3] hover:border-[#bac9df] focus-visible:ring-3 ${error ? "border-[#d88690] focus-visible:border-[#c55b68] focus-visible:ring-[#d88690]/15" : "border-[#d9e1ec] focus-visible:border-[#4e7fe3] focus-visible:ring-[#5e8fe8]/15"}`}
        id={id}
        maxLength={160}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <FieldMessage error={error} helper={helper} />
    </div>
  );
}

function FrequencyField({
  error,
  labels,
  onValueChange,
  value,
}: {
  readonly error?: string;
  readonly labels: RecurringUiLabels;
  readonly onValueChange: (value: number) => void;
  readonly value: number;
}) {
  const labelByKey = {
    weekly: labels.create.frequencyWeekly,
    biweekly: labels.create.frequencyBiweekly,
    monthly: labels.create.frequencyMonthly,
    quarterly: labels.create.frequencyQuarterly,
    yearly: labels.create.frequencyYearly,
  };
  const options = recurringFrequencyOptions.map((option) => ({
    value: String(option.cadenceDays),
    label: labelByKey[option.key],
  }));
  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]">
        {labels.create.frequency}
      </label>
      <PaceSearchSelect
        ariaLabel={labels.create.frequency}
        emptyLabel={labels.create.frequencyPlaceholder}
        invalid={Boolean(error)}
        onValueChange={(next) => onValueChange(Number(next))}
        options={options}
        placeholder={labels.create.frequencyPlaceholder}
        searchPlaceholder={labels.create.frequencyPlaceholder}
        triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
        value={String(value)}
      />
      <FieldMessage error={error} />
    </div>
  );
}

function DateField({
  error,
  label,
  onValueChange,
  value,
}: {
  readonly error?: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  const id = "recurring-next-occurrence";
  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]" htmlFor={id}>
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2 rounded-[8px] border bg-white px-3 transition-[border-color,box-shadow] focus-within:ring-3 ${error ? "border-[#d88690] focus-within:border-[#c55b68] focus-within:ring-[#d88690]/15" : "border-[#d9e1ec] focus-within:border-[#4e7fe3] focus-within:ring-[#5e8fe8]/15"}`}>
        <FiCalendar
          aria-hidden="true"
          className="size-4 shrink-0 text-[#60769e]"
        />
        <input
          aria-invalid={Boolean(error) || undefined}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#13213f] outline-none"
          id={id}
          onChange={(event) => onValueChange(event.target.value)}
          type="date"
          value={value}
        />
      </div>
      <FieldMessage error={error} />
    </div>
  );
}

function AccountField({
  accounts,
  error,
  label,
  labels,
  locale,
  onValueChange,
  value,
}: {
  readonly accounts: readonly RecurringCreateAccountOption[];
  readonly error?: string;
  readonly label: string;
  readonly labels: RecurringUiLabels;
  readonly locale: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  const options: SelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: account.name,
    description:
      account.availableBalanceMinor === undefined
        ? account.currency
        : `${labels.create.available} · ${formatOverviewMoney(account.availableBalanceMinor, account.currency, locale)}`,
  }));
  return (
    <div className="grid min-w-0 gap-2">
      <label className="text-[13px] font-medium text-[#384862]">{label}</label>
      {options.length ? (
        <PaceSearchSelect
          ariaLabel={label}
          emptyLabel={labels.create.accountEmpty}
          invalid={Boolean(error)}
          onValueChange={onValueChange}
          options={options}
          placeholder={labels.create.accountPlaceholder}
          renderOption={(option) => (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[#edf3ff] text-[#356fe0]">
                <FiCreditCard aria-hidden="true" className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {option.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#71809a]">
                  {option.description}
                </span>
              </span>
            </span>
          )}
          renderValue={(option) => (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-[#edf3ff] text-[#356fe0]">
                <FiCreditCard aria-hidden="true" className="size-3.5" />
              </span>
              <span className="truncate">{option.label}</span>
            </span>
          )}
          searchPlaceholder={labels.create.accountSearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
          value={value}
        />
      ) : (
        <div className="flex h-11 items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-[13px] text-[#71809a]">
          {labels.create.accountEmpty}
        </div>
      )}
      <FieldMessage error={error} />
    </div>
  );
}

function CategoryField({
  categories,
  error,
  labels,
  onValueChange,
  value,
}: {
  readonly categories: readonly RecurringCreateCategoryOption[];
  readonly error?: string;
  readonly labels: RecurringUiLabels;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  const options = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
  return (
    <div className="grid min-w-0 gap-2">
      <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]">
        <span>{labels.create.category}</span>
        <span className="text-[12px] font-normal text-[#71809a]">
          {labels.create.categoryOptional}
        </span>
      </label>
      {options.length ? (
        <PaceSearchSelect
          ariaLabel={labels.create.category}
          emptyLabel={labels.create.categoryEmpty}
          invalid={Boolean(error)}
          onValueChange={onValueChange}
          options={options}
          placeholder={labels.create.categoryPlaceholder}
          renderValue={(option) => (
            <span className="flex min-w-0 items-center gap-2">
              <FiTag
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[#60769e]"
              />
              <span className="truncate">{option.label}</span>
            </span>
          )}
          searchPlaceholder={labels.create.categorySearch}
          triggerClassName="h-11 rounded-[8px] px-3 text-[13px] font-normal"
          value={value}
        />
      ) : (
        <div className="flex h-11 items-center rounded-[8px] border border-[#d9e1ec] bg-[#f8faff] px-3 text-[13px] text-[#71809a]">
          {labels.create.categoryEmpty}
        </div>
      )}
      <FieldMessage error={error} />
    </div>
  );
}

function Review({
  account,
  category,
  draft,
  labels,
  locale,
}: {
  readonly account: RecurringCreateAccountOption;
  readonly category: RecurringCreateCategoryOption | undefined;
  readonly draft: RecurringCreateDraft;
  readonly labels: RecurringUiLabels;
  readonly locale: string;
}) {
  const validation = validateRecurringDraft(
    draft,
    [account],
    category ? [category] : [],
  );
  const amount = validation.isValid
    ? formatOverviewMoney(validation.amountMinor, account.currency, locale)
    : "—";
  const frequency = recurringFrequencyOptions.find(
    (option) => option.cadenceDays === draft.cadenceDays,
  )?.key;
  const frequencyLabel =
    frequency === "weekly"
      ? labels.create.frequencyWeekly
      : frequency === "biweekly"
        ? labels.create.frequencyBiweekly
        : frequency === "quarterly"
          ? labels.create.frequencyQuarterly
          : frequency === "yearly"
            ? labels.create.frequencyYearly
            : labels.create.frequencyMonthly;
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(nextOccurrenceIso(draft.nextOccurrence)));
  return (
    <section
      aria-labelledby="recurring-review-summary"
      className="rounded-[10px] border border-[#e3e9f2] bg-[#fbfcfe] p-4 sm:p-5">
      <p className="text-[12px] font-medium text-[#60708b]">
        {draft.direction === "EXPENSE"
          ? labels.create.typeExpense
          : labels.create.typeIncome}
      </p>
      <h3
        className="mt-1 text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]"
        id="recurring-review-summary">
        {draft.name.trim()}
      </h3>
      <p className="mt-1.5 text-[24px] leading-7 font-semibold tracking-[-0.035em] text-[#172442]">
        {amount}
      </p>
      <dl className="mt-5 grid gap-3 border-t border-[#e6ebf2] pt-4 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[#71809a]">{labels.create.frequency}</dt>
          <dd className="mt-0.5 font-medium text-[#263550]">
            {frequencyLabel}
          </dd>
        </div>
        <div>
          <dt className="text-[#71809a]">{labels.create.nextOccurrence}</dt>
          <dd className="mt-0.5 font-medium text-[#263550]">{date}</dd>
        </div>
        <div>
          <dt className="text-[#71809a]">
            {draft.direction === "INCOME"
              ? labels.create.receivingAccount
              : labels.create.account}
          </dt>
          <dd className="mt-0.5 font-medium text-[#263550]">{account.name}</dd>
        </div>
        {category ? (
          <div>
            <dt className="text-[#71809a]">{labels.create.category}</dt>
            <dd className="mt-0.5 font-medium text-[#263550]">
              {category.name}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export function RecurringCreateDialog({
  accounts,
  accountAvailability,
  categories,
  categoryAvailability,
  defaultCurrency,
  defaultNextOccurrence,
  labels,
  locale,
  onOpenChange,
  open,
  workspaceId,
}: RecurringCreateDialogProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(() =>
    createRecurringDraft(defaultNextOccurrence),
  );
  const [errors, setErrors] = useState<RecurringCreateErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [view, setView] = useState<"form" | "review">("form");
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const selectedAccount = accounts.find(
    (account) => account.id === draft.accountId,
  );
  const eligibleCategories = compatibleRecurringCategories(
    categories,
    draft.direction,
  );
  const selectedCategory = eligibleCategories.find(
    (category) => category.id === draft.categoryId,
  );
  const currency = selectedAccount?.currency ?? defaultCurrency;

  function updateDraft(patch: Partial<RecurringCreateDraft>) {
    if (pending) return;
    idempotencyKey.current = null;
    setErrors({});
    setFormError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }

  function requestClose(nextOpen: boolean) {
    if (pending || nextOpen) return;
    resetAndClose();
  }

  function resetAndClose() {
    idempotencyKey.current = null;
    setDraft(createRecurringDraft(defaultNextOccurrence));
    setErrors({});
    setFormError(null);
    setView("form");
    onOpenChange(false);
  }

  function requestReview() {
    const validation = validateRecurringDraft(draft, accounts, categories);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    setView("review");
  }

  async function submit() {
    const validation = validateRecurringDraft(draft, accounts, categories);
    if (!validation.isValid) {
      setErrors(validation.errors);
      setView("form");
      return;
    }
    setPending(true);
    setFormError(null);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/recurring`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            direction: draft.direction,
            name: draft.name.trim(),
            amountMinor: validation.amountMinor,
            currency: validation.currency,
            cadenceDays: draft.cadenceDays,
            nextOccurrenceAt: nextOccurrenceIso(draft.nextOccurrence),
            accountId: draft.accountId,
            categoryId: draft.categoryId || null,
            merchantOrSource: draft.merchantOrSource.trim() || null,
            idempotencyKey: key,
          }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isCreateResponse(payload)) {
        const code = readErrorCode(payload);
        const field = mapRecurringCreateFailure(code);
        if (field) setErrors({ [field]: fieldErrorForServerCode(code) });
        setFormError(field ? null : labels.create.failed);
        return;
      }
      resetAndClose();
      router.refresh();
    } catch {
      setFormError(labels.create.failed);
    } finally {
      setPending(false);
    }
  }

  const identityLabel =
    draft.direction === "EXPENSE"
      ? labels.create.merchant
      : labels.create.source;
  const identityPlaceholder =
    draft.direction === "EXPENSE"
      ? labels.create.merchantPlaceholder
      : labels.create.sourcePlaceholder;
  const identityHelper =
    draft.direction === "EXPENSE"
      ? labels.create.merchantHelper
      : labels.create.sourceHelper;

  return (
    <ResponsiveDialog onOpenChange={requestClose} open={open}>
      <ResponsiveDialogContent
        className="flex! max-h-[calc(100dvh-1rem)] min-h-0 w-[calc(100%-1rem)] max-w-162.5 flex-col gap-0 overflow-hidden rounded-[12px] border border-[#e1e7f0] bg-white p-0 text-[#101a35] shadow-[0_18px_45px_rgb(15_23_42/14%)] sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:max-w-162.5"
        drawerClassName="w-full max-w-none rounded-none rounded-t-[14px] border-x-0 border-b-0 border-[#e1e7f0] shadow-[0_-12px_32px_rgb(15_23_42/12%)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] data-[vaul-drawer-direction=bottom]:rounded-t-[14px]">
        <Button
          aria-label={labels.create.close}
          className="absolute top-3 right-3 z-10 size-8 rounded-[7px] text-[#61708a] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:top-4 sm:right-4"
          disabled={pending}
          onClick={() => requestClose(false)}
          size="icon"
          type="button"
          variant="ghost">
          <FiX aria-hidden="true" className="size-4.5" />
        </Button>
        <ResponsiveDialogHeader className="gap-1 px-4 pt-5 pb-4 pr-12 sm:px-7 sm:pt-6 sm:pb-5 sm:pr-14">
          {view === "review" ? (
            <Button
              className="-ml-2 mb-1 h-7 w-fit gap-1 rounded-[6px] px-2 text-[12px] font-medium text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30"
              disabled={pending}
              onClick={() => setView("form")}
              type="button"
              variant="ghost">
              <FiArrowLeft aria-hidden="true" className="size-3.75" />
              {labels.create.back}
            </Button>
          ) : null}
          <ResponsiveDialogTitle className="text-[20px] leading-6 font-semibold tracking-tight text-[#101a35]">
            {view === "review"
              ? labels.create.reviewTitle
              : labels.create.title}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {view === "review"
              ? labels.create.reviewDescription
              : labels.create.subtitle}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
          {view === "form" ? (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                requestReview();
              }}>
              <RecurringTypeSelector
                disabled={pending}
                labels={{
                  ariaLabel: labels.create.type,
                  expense: labels.create.typeExpense,
                  income: labels.create.typeIncome,
                }}
                onValueChange={(direction) =>
                  updateDraft({ direction, categoryId: "" })
                }
                value={draft.direction}
              />
              <PaceMoneyInput
                currency={currency}
                disabled={pending}
                error={validationMessage(labels, errors.amount)}
                helperText={labels.create.amountHelper}
                label={labels.create.amount}
                onValueChange={(amount) => updateDraft({ amount })}
                value={draft.amount}
              />
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <TextField
                  error={validationMessage(labels, errors.name)}
                  label={labels.create.name}
                  onValueChange={(name) => updateDraft({ name })}
                  placeholder={labels.create.namePlaceholder}
                  value={draft.name}
                />
                <TextField
                  error={validationMessage(labels, errors.merchantOrSource)}
                  helper={identityHelper}
                  label={identityLabel}
                  onValueChange={(merchantOrSource) =>
                    updateDraft({ merchantOrSource })
                  }
                  placeholder={identityPlaceholder}
                  value={draft.merchantOrSource}
                />
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <FrequencyField
                  error={validationMessage(labels, errors.frequency)}
                  labels={labels}
                  onValueChange={(cadenceDays) => updateDraft({ cadenceDays })}
                  value={draft.cadenceDays}
                />
                <DateField
                  error={validationMessage(labels, errors.nextOccurrence)}
                  label={labels.create.nextOccurrence}
                  onValueChange={(nextOccurrence) =>
                    updateDraft({ nextOccurrence })
                  }
                  value={draft.nextOccurrence}
                />
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <AccountField
                  accounts={accountAvailability === "ready" ? accounts : []}
                  error={validationMessage(labels, errors.account)}
                  label={
                    draft.direction === "INCOME"
                      ? labels.create.receivingAccount
                      : labels.create.account
                  }
                  labels={labels}
                  locale={locale}
                  onValueChange={(accountId) => updateDraft({ accountId })}
                  value={draft.accountId}
                />
                <CategoryField
                  categories={
                    categoryAvailability === "ready" ? eligibleCategories : []
                  }
                  error={validationMessage(labels, errors.category)}
                  labels={labels}
                  onValueChange={(categoryId) => updateDraft({ categoryId })}
                  value={draft.categoryId}
                />
              </div>
              <aside className="rounded-[8px] bg-[#f5f8fd] px-3 py-2.5 text-[12px] leading-5 text-[#526987]">
                {labels.create.noAutomaticTransaction}
              </aside>
            </form>
          ) : selectedAccount ? (
            <div className="space-y-4">
              <Review
                account={selectedAccount}
                category={selectedCategory}
                draft={draft}
                labels={labels}
                locale={locale}
              />
              <p className="text-[12px] leading-5 text-[#71809a]">
                {labels.create.projectionNotice}
              </p>
            </div>
          ) : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#e7ecf3] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7 sm:py-4">
          <p
            aria-live="assertive"
            className={
              formError
                ? "mr-auto text-[12px] leading-5 text-[#c23445]"
                : "sr-only"
            }
            role="alert">
            {formError}
          </p>
          {view === "review" ? (
            <Button
              className="h-10 rounded-[8px] px-3.5 text-[13px] text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:h-9"
              disabled={pending}
              onClick={() => setView("form")}
              type="button"
              variant="ghost">
              {labels.create.back}
            </Button>
          ) : (
            <Button
              className="h-10 rounded-[8px] px-3.5 text-[13px] text-[#526987] hover:bg-[#f3f6fa] hover:text-[#263550] focus-visible:ring-[#5e8fe8]/30 sm:h-9"
              disabled={pending}
              onClick={() => requestClose(false)}
              type="button"
              variant="ghost">
              {labels.create.cancel}
            </Button>
          )}
          <Button
            aria-busy={pending || undefined}
            className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
            disabled={pending}
            onClick={view === "review" ? submit : requestReview}
            type="button">
            {view === "review" && pending
              ? labels.create.adding
              : view === "review"
                ? labels.create.confirm
                : labels.create.review}
          </Button>
        </footer>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
