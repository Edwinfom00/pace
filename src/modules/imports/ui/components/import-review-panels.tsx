"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "cn";
import { ArrowLeftRight, ArrowUpRight, Check, CircleAlert, EyeOff, LoaderCircle, Plus, RotateCcw, Wallet } from "lucide-react";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/money/currency";
import { CreateAccountForm, type CreateAccountFormDraft } from "@/modules/ledger/ui/components/create-account-form";
import type { CreateAccountFormErrors } from "@/modules/ledger/ui/components/create-account-flow";
import type { OnboardingLanguage } from "@/modules/onboarding/metadata";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import { TransactionAccountField } from "@/modules/transactions/ui/components/transaction-account-field";
import type { TransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

import type { ImportField } from "../../domain";
import type { ImportReviewView as ImportReviewData } from "../../import-service";
import type { ImportFileAccount, ImportReviewIssue } from "../../review";
import { isoDateForInput } from "../import-execution-flow";
import type { ImportExecutionLabels } from "../import-execution-labels";
import { formatImportLabel } from "../import-upload-labels";

export type ImportAccountTarget =
  | { readonly kind: "SOURCE" | "DESTINATION"; readonly key: string }
  | { readonly kind: "DEFAULT" | "TRANSFER_DEFAULT" };

export function importAccountTargetKey(target: ImportAccountTarget): string {
  return "key" in target ? `account:${target.kind}:${target.key}` : `account:${target.kind}`;
}

type AccountFieldLabels = Pick<
  TransactionUiLabels,
  | "accountsEmptyTitle"
  | "accountsEmptyDescription"
  | "accountsSearchNoResults"
  | "accountsCreate"
  | "accountsCreateFirst"
  | "formAccountSearch"
  | "balance"
  | "createAccountForm"
>;

export function ImportAccountsPanel({
  labels,
  accountLabels,
  locale,
  review,
  accounts,
  pendingKey,
  disabled,
  onAssign,
  onCreate,
}: {
  readonly labels: ImportExecutionLabels;
  readonly accountLabels: AccountFieldLabels;
  readonly locale: string;
  readonly review: ImportReviewData;
  readonly accounts: readonly TransactionAccountOption[];
  readonly pendingKey: string | null;
  readonly disabled: boolean;
  readonly onAssign?: (target: ImportAccountTarget, accountId: string) => void;
  readonly onCreate?: (target: ImportAccountTarget, suggestion: ImportFileAccount["suggestion"] | null) => void;
}) {
  const titleId = `${useId()}-accounts`;
  const showDefault = !review.accountColumnMapped || review.unreferencedRowCount > 0;
  const field = (target: ImportAccountTarget, value: string | null, label: string, helper?: string, excluded?: string | null) => (
    <TransactionAccountField
      accounts={accounts}
      balanceKind="current"
      balanceLabels={accountLabels.balance}
      createAccountLabel={accountLabels.accountsCreate}
      createFirstAccountLabel={accountLabels.accountsCreateFirst}
      disabled={disabled}
      disabledAccountIds={excluded ? [excluded] : []}
      emptyDescription={accountLabels.accountsEmptyDescription}
      emptyTitle={accountLabels.accountsEmptyTitle}
      helperText={helper}
      label={label}
      locale={locale}
      noResultsLabel={accountLabels.accountsSearchNoResults}
      onCreateAccount={onCreate ? () => onCreate(target, null) : undefined}
      onValueChange={(accountId) => onAssign?.(target, accountId)}
      placeholder={labels.chooseAccount}
      searchPlaceholder={accountLabels.formAccountSearch}
      value={value ?? ""}
    />
  );

  return (
    <section aria-labelledby={titleId} className="rounded-md border border-[#e5eaf1] bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-[#eef1f5] px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-[#14213c]" id={titleId}>
            <Wallet aria-hidden className="size-4 text-[#0e8fb5]" />
            {review.accountColumnMapped ? labels.accountsTitle : labels.accountTitle}
          </h2>
          <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">
            {review.accountColumnMapped ? labels.accountsDescription : labels.accountHint}
          </p>
        </div>
        {pendingKey?.startsWith("account:") ? (
          <LoaderCircle aria-label={labels.updatingReview} className="mt-0.5 size-4 shrink-0 animate-spin text-[#2563eb] motion-reduce:animate-none" />
        ) : null}
      </div>

      <div className="divide-y divide-[#eef1f5]">
        {review.sourceAccounts.map((fileAccount) => (
          <FileAccountRow
            excluded={null}
            field={field}
            fileAccount={fileAccount}
            key={`source:${fileAccount.key}`}
            labels={labels}
            accountLabels={accountLabels}
            locale={locale}
            onCreate={onCreate}
            pending={pendingKey === importAccountTargetKey({ kind: "SOURCE", key: fileAccount.key })}
            disabled={disabled}
          />
        ))}
        {showDefault ? (
          <div className="px-4 py-4 sm:px-5">
            {field(
              { kind: "DEFAULT" },
              review.accountId,
              review.accountColumnMapped ? labels.defaultAccountLabel : labels.accountLabel,
              review.accountColumnMapped ? labels.defaultAccountHint : undefined,
            )}
          </div>
        ) : null}
      </div>

      {review.destinationAccounts.length || review.transferAccountRequired ? (
        <div className="border-t border-[#eef1f5]">
          <div className="px-4 pt-4 sm:px-5">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#14213c]">
              <ArrowLeftRight aria-hidden className="size-3.5 text-[#0f9f6e]" />
              {labels.destinationsTitle}
            </h3>
            <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">{labels.destinationsDescription}</p>
          </div>
          <div className="divide-y divide-[#eef1f5]">
            {review.destinationAccounts.map((fileAccount) => (
              <FileAccountRow
                excluded={null}
                field={field}
                fileAccount={fileAccount}
                key={`destination:${fileAccount.key}`}
                labels={labels}
                accountLabels={accountLabels}
                locale={locale}
                onCreate={onCreate}
                pending={pendingKey === importAccountTargetKey({ kind: "DESTINATION", key: fileAccount.key })}
                disabled={disabled}
              />
            ))}
            {review.transferAccountRequired ? (
              <div className="px-4 py-4 sm:px-5">
                {field({ kind: "TRANSFER_DEFAULT" }, review.transferAccountId, labels.transferAccountLabel, labels.transferAccountHint, review.accountId)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FileAccountRow({
  fileAccount,
  labels,
  accountLabels,
  locale,
  field,
  pending,
  disabled,
  excluded,
  onCreate,
}: {
  readonly fileAccount: ImportFileAccount;
  readonly labels: ImportExecutionLabels;
  readonly accountLabels: AccountFieldLabels;
  readonly locale: string;
  readonly field: (target: ImportAccountTarget, value: string | null, label: string, helper?: string, excluded?: string | null) => ReactNode;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly excluded: string | null;
  readonly onCreate?: (target: ImportAccountTarget, suggestion: ImportFileAccount["suggestion"] | null) => void;
}) {
  const target: ImportAccountTarget = { kind: fileAccount.role, key: fileAccount.key };
  const number = new Intl.NumberFormat(locale);
  const rows = formatImportLabel(
    new Intl.PluralRules(locale).select(fileAccount.rowCount) === "one" ? labels.rowsOne : labels.rowsOther,
    { count: number.format(fileAccount.rowCount) },
  );
  const assigned = Boolean(fileAccount.accountId);
  const suggestionType = accountLabels.createAccountForm.accountTypes[fileAccount.suggestion.type].label;

  return (
    <div className="px-4 py-4 sm:px-5" data-file-account={fileAccount.key} data-state={assigned ? "assigned" : "missing"}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#14213c]">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", assigned ? "bg-[#16a34a]" : "bg-[#f59e0b]")} />
          <span className="truncate" title={fileAccount.label}>{fileAccount.label}</span>
        </p>
        <span className="shrink-0 rounded-md bg-[#f1f4f8] px-2 py-0.5 text-[11px] font-medium text-[#53627b] tabular-nums">{rows}</span>
      </div>
      {field(target, fileAccount.accountId, labels.paceAccount, undefined, excluded)}
      {assigned ? (
        fileAccount.matchedByName ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[#15803d]">
            <Check aria-hidden className="size-3" strokeWidth={3} />
            {labels.matchedByName}
          </p>
        ) : null
      ) : (
        <div className="mt-2.5 rounded-md border border-dashed border-[#f2c98a] bg-[#fffaf0] p-3">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#b45309]">
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            {labels.notInPace}
          </p>
          <p className="mt-0.5 text-[11px] text-[#8a6a3b]">
            {formatImportLabel(labels.suggestedAccount, { type: suggestionType, currency: fileAccount.suggestion.currency })}
          </p>
          {onCreate ? (
            <Button
              className="mt-2.5 h-10 w-full justify-center rounded-md bg-[#2563eb] px-3 text-[12px] font-medium text-white shadow-none hover:bg-[#1e55d1] sm:h-9"
              disabled={disabled || pending}
              onClick={() => onCreate(target, fileAccount.suggestion)}
              type="button"
            >
              {pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Plus aria-hidden className="size-3.5" />}
              <span className="truncate">{formatImportLabel(labels.createSuggested, { name: fileAccount.suggestion.name })}</span>
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ImportFixRowsPanel({
  labels,
  locale,
  issues,
  blockingCount,
  accountBlockedCount,
  skippedRowNumbers,
  pendingKey,
  disabled,
  onCorrect,
  onSkip,
  onRestoreSkipped,
}: {
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly issues: readonly ImportReviewIssue[];
  readonly blockingCount: number;
  readonly accountBlockedCount: number;
  readonly skippedRowNumbers: readonly number[];
  readonly pendingKey: string | null;
  readonly disabled: boolean;
  readonly onCorrect?: (row: number, field: ImportField, value: string) => void;
  readonly onSkip?: (row: number) => void;
  readonly onRestoreSkipped?: () => void;
}) {
  const titleId = `${useId()}-fix`;
  const number = new Intl.NumberFormat(locale);
  const skippedCount = skippedRowNumbers.length;

  return (
    <section aria-labelledby={titleId} className="rounded-md border border-[#f5c2c2] bg-[#fffafa]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-[#14213c]" id={titleId}>
            <CircleAlert aria-hidden className="size-4 text-[#dc2626]" />
            {labels.fixTitle}
            <span className="rounded-md bg-[#fdecec] px-1.5 py-px text-[11px] font-semibold text-[#b42318] tabular-nums">{number.format(blockingCount)}</span>
          </h2>
          <p className="mt-0.5 text-[12px] leading-5 text-[#71809a]">{labels.fixDescription}</p>
        </div>
      </div>
      {accountBlockedCount ? (
        <div className="mx-3 mt-3 flex items-start gap-3 rounded-md border border-[#f2c98a] bg-[#fffaf0] px-3.5 py-3 sm:mx-4" data-account-blocked={accountBlockedCount}>
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#fdf1dc] text-[#b45309]">
            <Wallet className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#14213c]">
              {formatImportLabel(new Intl.PluralRules(locale).select(accountBlockedCount) === "one" ? labels.accountBlockedOne : labels.accountBlockedOther, {
                count: number.format(accountBlockedCount),
              })}
            </p>
            <p className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-5 text-[#8a6a3b]">
              <ArrowUpRight aria-hidden className="mt-1 size-3 shrink-0" />
              {labels.accountBlockedHint}
            </p>
          </div>
        </div>
      ) : null}
      <ul className="mt-3 space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
        {issues.map((issue) => (
          <FixRow
            disabled={disabled}
            issue={issue}
            key={`${issue.sourceRowNumber}:${issue.code}:${issue.value}`}
            labels={labels}
            locale={locale}
            onCorrect={onCorrect}
            onSkip={onSkip}
            pending={pendingKey === `row:${issue.sourceRowNumber}`}
          />
        ))}
      </ul>
      {blockingCount > issues.length + accountBlockedCount ? (
        <p className="px-4 pb-4 text-[12px] text-[#71809a] sm:px-5">
          {formatImportLabel(labels.blockingMore, { count: number.format(blockingCount - issues.length - accountBlockedCount) })}
        </p>
      ) : null}
      {skippedCount ? <SkippedSummary count={skippedCount} disabled={disabled} labels={labels} locale={locale} onRestore={onRestoreSkipped} /> : null}
    </section>
  );
}

export function SkippedSummary({
  count,
  labels,
  locale,
  disabled,
  onRestore,
}: {
  readonly count: number;
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly disabled: boolean;
  readonly onRestore?: () => void;
}) {
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#f6e1e1] px-4 py-3 sm:px-5" data-skipped={count}>
      <p className="flex items-center gap-2 text-[12px] text-[#53627b]">
        <EyeOff aria-hidden className="size-3.5 text-[#8a97ab]" />
        {formatImportLabel(new Intl.PluralRules(locale).select(count) === "one" ? labels.skippedSummaryOne : labels.skippedSummaryOther, {
          count: number.format(count),
        })}
      </p>
      {onRestore ? (
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[#2563eb] hover:bg-[#eef3ff] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          disabled={disabled}
          onClick={onRestore}
          type="button"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {labels.restoreSkipped}
        </button>
      ) : null}
    </div>
  );
}

function FixRow({
  issue,
  labels,
  locale,
  pending,
  disabled,
  onCorrect,
  onSkip,
}: {
  readonly issue: ImportReviewIssue;
  readonly labels: ImportExecutionLabels;
  readonly locale: string;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onCorrect?: (row: number, field: ImportField, value: string) => void;
  readonly onSkip?: (row: number) => void;
}) {
  const ids = useId();
  const kind = issue.field ? inputKind(issue.field) : null;
  const [value, setValue] = useState(() => initialValue(issue.value, kind));
  const number = new Intl.NumberFormat(locale);
  const changed = value.trim() !== issue.value.trim() && value.trim().length > 0;

  return (
    <li className="rounded-md border border-[#f6e1e1] bg-white p-3 sm:p-3.5" data-fix-row={issue.sourceRowNumber}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="rounded-md bg-[#f1f4f8] px-2 py-0.5 text-[11px] font-semibold text-[#14213c] tabular-nums">
          {formatImportLabel(labels.blockingRow, { row: number.format(issue.sourceRowNumber) })}
        </span>
        {issue.description ? <span className="min-w-0 truncate text-[13px] font-medium text-[#14213c]">{issue.description}</span> : null}
        <span className="ml-auto inline-flex items-center rounded-md bg-[#fdecec] px-2 py-0.5 text-[11px] font-medium text-[#b42318]">
          {labels.issues[issue.code]}
        </span>
      </div>

      {issue.field && kind ? (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (changed && issue.field) onCorrect?.(issue.sourceRowNumber, issue.field, value);
          }}
        >
          <div className="min-w-0">
            <label className="block text-[11px] font-medium text-[#71809a]" htmlFor={`${ids}-value`}>{labels.fields[issue.field]}</label>
            <input
              aria-describedby={`${ids}-file`}
              autoCapitalize={kind === "currency" ? "characters" : undefined}
              className="mt-1 h-11 w-full rounded-md border border-[#dfe5ee] bg-white px-3 text-[13px] text-[#14213c] transition-colors hover:border-[#c7d2e1] focus-visible:border-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2563eb]/30 disabled:opacity-60 sm:h-10"
              disabled={disabled || pending}
              id={`${ids}-value`}
              inputMode={kind === "amount" ? "decimal" : undefined}
              maxLength={kind === "currency" ? 3 : 200}
              onChange={(event) => setValue(kind === "currency" ? event.currentTarget.value.toUpperCase() : event.currentTarget.value)}
              placeholder={labels.fields[issue.field]}
              type={kind === "date" ? "date" : "text"}
              value={value}
            />
          </div>
          <Button
            aria-busy={pending}
            className="h-11 rounded-md bg-[#2563eb] px-4 text-[12px] font-medium text-white shadow-none hover:bg-[#1e55d1] sm:h-10"
            disabled={disabled || pending || !changed}
            type="submit"
          >
            {pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Check aria-hidden className="size-3.5" strokeWidth={3} />}
            {pending ? labels.fixSaving : labels.fixApply}
          </Button>
          <Button
            className="h-11 rounded-md px-3 text-[12px] font-medium text-[#53627b] hover:text-[#14213c] sm:h-10"
            disabled={disabled || pending}
            onClick={() => onSkip?.(issue.sourceRowNumber)}
            type="button"
            variant="ghost"
          >
            <EyeOff aria-hidden className="size-3.5" />
            {labels.fixSkip}
          </Button>
          <p className="text-[11px] text-[#8a97ab] sm:col-span-3" id={`${ids}-file`}>
            {issue.value ? formatImportLabel(labels.fixInFile, { value: issue.value }) : labels.fixEmptyInFile}
          </p>
        </form>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[12px] text-[#53627b]">
            <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-[#2563eb]" />
            {labels.blockingDescription}
          </p>
          <Button
            className="h-11 shrink-0 rounded-md px-3 text-[12px] font-medium text-[#53627b] hover:text-[#14213c] sm:h-9"
            disabled={disabled || pending}
            onClick={() => onSkip?.(issue.sourceRowNumber)}
            type="button"
            variant="ghost"
          >
            {pending ? <LoaderCircle aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" /> : <EyeOff aria-hidden className="size-3.5" />}
            {labels.fixSkip}
          </Button>
        </div>
      )}
    </li>
  );
}

type InputKind = "date" | "amount" | "currency" | "text";

function inputKind(field: ImportField): InputKind {
  if (field === "transactionDate" || field === "bookingDate") return "date";
  if (field === "amount" || field === "debit" || field === "credit") return "amount";
  if (field === "currency") return "currency";
  return "text";
}

function initialValue(raw: string, kind: InputKind | null): string {
  if (kind === "date") return isoDateForInput(raw);
  if (kind === "amount") return raw.replace(/[oO]/g, "0");
  return raw;
}

export function ImportCreateAccountDialog({
  open,
  draft,
  errors,
  formError,
  submitting,
  labels,
  language,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: {
  readonly open: boolean;
  readonly draft: CreateAccountFormDraft;
  readonly errors: CreateAccountFormErrors;
  readonly formError: string | null;
  readonly submitting: boolean;
  readonly labels: Pick<TransactionUiLabels, "accountCreateTitle" | "accountCreateSubtitle" | "createAccountForm">;
  readonly language: OnboardingLanguage;
  readonly onDraftChange: (draft: CreateAccountFormDraft) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <ResponsiveDialog onOpenChange={(next) => !submitting && onOpenChange(next)} open={open}>
      <ResponsiveDialogContent
        className="gap-0 overflow-hidden rounded-[16px] p-0 sm:max-w-120"
        drawerClassName="max-h-[calc(100svh-1rem)] rounded-t-[16px]"
      >
        <ResponsiveDialogHeader className="bg-white px-5 pt-6 pb-2 lg:px-6">
          <ResponsiveDialogTitle className="text-[18px] font-semibold tracking-[-0.02em] text-[#101a35]">
            {labels.accountCreateTitle}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="text-[13px] leading-5 text-[#71809a]">
            {labels.accountCreateSubtitle}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="min-h-0 overflow-y-auto px-5 pt-2 pb-5 lg:px-6 lg:pb-6">
          <CreateAccountForm
            draft={draft}
            errors={errors}
            formError={formError}
            isSubmitting={submitting}
            labels={labels.createAccountForm}
            language={language}
            onCancel={() => onOpenChange(false)}
            onDraftChange={onDraftChange}
            onSubmit={onSubmit}
          />
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function suggestionDraft(
  suggestion: ImportFileAccount["suggestion"] | null,
  fallbackCurrency: CurrencyCode,
): CreateAccountFormDraft {
  return {
    name: suggestion?.name ?? "",
    type: suggestion?.type ?? "",
    currency: (suggestion?.currency as CurrencyCode | undefined) ?? fallbackCurrency,
    openingBalance: "",
  };
}
