"use client";

import { Button } from "@/components/ui/button";
import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

import type { TransactionEditLabels } from "../transaction-edit-labels";
import { accountBalanceText } from "./transaction-balance";
import { formatTransactionFormDate } from "./transaction-date-field";
import {
  parseTransactionEditAmount,
  type TransactionCorrectionFormError,
  type TransactionEditChangeClassification,
  type TransactionEditDraft,
  type TransactionEditField,
} from "./transaction-edit-flow";

export type TransactionCorrectionReason = "" | "INCORRECT_AMOUNT" | "WRONG_ACCOUNT" | "WRONG_TRANSFER_DETAILS" | "OTHER";

export function TransactionCorrectionReview({
  accounts,
  baseline,
  categories,
  classification,
  draft,
  labels,
  locale,
  correctionError,
  correctionBalanceMessage,
  isApplying,
  onApply,
  onBack,
  onReloadLatest,
  onReasonChange,
  onReasonDetailsChange,
  reason,
  reasonDetails,
  transaction,
}: {
  readonly accounts: readonly TransactionAccountOption[];
  readonly baseline: TransactionEditDraft;
  readonly categories: readonly TransactionCategoryOption[];
  readonly classification: TransactionEditChangeClassification;
  readonly draft: TransactionEditDraft;
  readonly labels: TransactionEditLabels;
  readonly locale: string;
  readonly correctionError: TransactionCorrectionFormError;
  readonly correctionBalanceMessage?: string | null;
  readonly isApplying: boolean;
  readonly onApply: () => void;
  readonly onBack: () => void;
  readonly onReloadLatest: () => void;
  readonly onReasonChange: (value: TransactionCorrectionReason) => void;
  readonly onReasonDetailsChange: (value: string) => void;
  readonly reason: TransactionCorrectionReason;
  readonly reasonDetails: string;
  readonly transaction: TransactionDetailData;
}) {
  const changes = [...classification.financialFields, ...classification.metadataFields]
    .map((field) => reviewChangeFor(field, baseline, draft, transaction, categories, accounts, labels, locale));
  const feedback = correctionFeedback(correctionError, labels);
  const balanceAccounts = correctionBalanceAccounts(transaction, draft, accounts);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 sm:px-7 sm:pb-7">
        <div className="grid gap-5">
          <section aria-label={labels.correction.reviewTitle}>
            <div className="divide-y divide-[#e8edf4] rounded-[10px] border border-[#e1e7f0] bg-white">
              {changes.map((change) => (
                <article className={change.isFinancial ? "bg-[#fbfdff] px-3.5 py-3.5 sm:px-4" : "px-3.5 py-3.5 sm:px-4"} key={change.field}>
                  <h3 className={change.isFinancial
                    ? "text-[12px] font-semibold tracking-wider text-[#263d68] uppercase"
                    : "text-[12px] font-medium text-[#53627b]"}
                  >
                    {change.label}
                  </h3>
                  <dl className="mt-2 grid gap-3 sm:grid-cols-2 sm:gap-5">
                    <ComparisonValue label={labels.correction.before} value={change.before} />
                    <ComparisonValue label={labels.correction.after} value={change.after} emphasized={change.isFinancial} />
                  </dl>
                </article>
              ))}
            </div>
          </section>

          {balanceAccounts.length > 0 ? (
            <section aria-label={labels.balance.current} className="rounded-[10px] border border-[#e1e7f0] bg-[#fbfdff] px-3.5 py-3 sm:px-4">
              <p className="text-[12px] font-medium text-[#53627b]">{labels.balance.current}</p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {balanceAccounts.map((account) => (
                  <div className="min-w-0" key={account.id}>
                    <dt className="truncate text-[12px] font-medium text-[#263550]">{account.name}</dt>
                    <dd className="mt-0.5 truncate text-[12px] tabular-nums text-[#60708a]">
                      {accountBalanceText(account, locale, labels.balance, "current") ?? labels.balance.unavailable}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="transaction-correction-reason-label" className="grid gap-2">
            <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-[#384862]" htmlFor="transaction-correction-reason">
              <span id="transaction-correction-reason-label">{labels.correction.reason}</span>
              <span className="text-[12px] font-normal text-[#71809a]">{labels.correction.reasonOptional}</span>
            </label>
            <select
              className="h-11 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
              disabled={isApplying}
              id="transaction-correction-reason"
              onChange={(event) => onReasonChange(event.target.value as TransactionCorrectionReason)}
              value={reason}
            >
              <option value="">{labels.correction.reasonOptional}</option>
              <option value="INCORRECT_AMOUNT">{labels.correction.incorrectAmount}</option>
              <option value="WRONG_ACCOUNT">{labels.correction.wrongAccount}</option>
              {transaction.kind === "TRANSFER" ? <option value="WRONG_TRANSFER_DETAILS">{labels.correction.wrongTransferDetails}</option> : null}
              <option value="OTHER">{labels.correction.other}</option>
            </select>
            {reason === "OTHER" ? (
              <input
                aria-label={labels.correction.reasonDetails}
                className="h-11 rounded-[8px] border border-[#d9e1ec] bg-white px-3 text-[13px] text-[#13213f] outline-none transition-[border-color,box-shadow] placeholder:text-[#8a9ab3] hover:border-[#bac9df] focus-visible:border-[#4e7fe3] focus-visible:ring-3 focus-visible:ring-[#5e8fe8]/15"
                disabled={isApplying}
                maxLength={500}
                onChange={(event) => onReasonDetailsChange(event.target.value)}
                placeholder={labels.correction.reasonDetails}
                type="text"
                value={reasonDetails}
              />
            ) : null}
          </section>

          <p className="rounded-[8px] bg-[#f7f9fc] px-3 py-2.5 text-[12px] leading-5 text-[#53627b]">{labels.correction.originalPreserved}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-[#e6eaf0] bg-[#fcfdff] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-7">
        <p
          aria-live={correctionError === "conflict" || correctionError === "notAllowed" ? "assertive" : "polite"}
          className="mr-auto text-[12px] leading-5 text-[#71809a]"
          id="transaction-correction-apply-status"
          role={correctionError ? "alert" : "status"}
        >
          {isApplying ? labels.correction.applying : correctionBalanceMessage ?? feedback ?? ""}
        </p>
        <Button
          className="h-10 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] hover:bg-[#f3f6fa] hover:text-[#263550]"
          disabled={isApplying}
          onClick={onBack}
          type="button"
          variant="ghost"
        >
          {labels.correction.backToEdit}
        </Button>
        {correctionError === "conflict" ? (
          <Button
            className="h-10 rounded-[8px] border border-[#dfe5ee] bg-white px-4 text-[13px] font-medium text-[#43516a] hover:bg-[#f3f6fa] hover:text-[#263550]"
            disabled={isApplying}
            onClick={onReloadLatest}
            type="button"
            variant="ghost"
          >
            {labels.correction.reloadLatest}
          </Button>
        ) : null}
        <Button
          aria-describedby="transaction-correction-apply-status"
          className="h-10 rounded-[8px] bg-[#2563eb] px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isApplying || correctionError === "conflict" || correctionError === "notAllowed"}
          onClick={onApply}
          type="button"
        >
          {isApplying ? labels.correction.applying : labels.correction.apply}
        </Button>
      </div>
    </div>
  );
}

function correctionBalanceAccounts(
  transaction: TransactionDetailData,
  draft: TransactionEditDraft,
  accounts: readonly TransactionAccountOption[],
): readonly TransactionAccountOption[] {
  const ids = transaction.kind === "TRANSFER"
    ? [draft.fromAccount, draft.toAccount]
    : [draft.account];
  return ids.flatMap((id) => {
    const account = accounts.find((candidate) => candidate.id === id);
    return account ? [account] : [];
  }).filter((account, index, collection) => collection.findIndex((candidate) => candidate.id === account.id) === index);
}

function correctionFeedback(
  error: TransactionCorrectionFormError,
  labels: TransactionEditLabels,
): string | null {
  switch (error) {
    case "amount":
      return labels.amountInvalid;
    case "refundLimit":
      return labels.correction.refundLimit;
    case "account":
      return labels.accountUnavailable;
    case "currency":
      return labels.crossCurrencyTransferUnsupported;
    case "transfer":
      return labels.sameTransferAccount;
    case "conflict":
      return labels.correction.conflict;
    case "notAllowed":
      return labels.correction.notAllowed;
    case "failed":
      return labels.correction.failed;
    default:
      return null;
  }
}

function ComparisonValue({ label, value, emphasized = false }: { readonly label: string; readonly value: string; readonly emphasized?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#71809a]">{label}</dt>
      <dd className={emphasized
        ? "mt-0.5 wrap-break-word text-[14px] font-semibold tabular-nums text-[#172d56]"
        : "mt-0.5 wrap-break-word text-[13px] text-[#33415a]"}
      >
        {value}
      </dd>
    </div>
  );
}

function reviewChangeFor(
  field: TransactionEditField,
  baseline: TransactionEditDraft,
  draft: TransactionEditDraft,
  transaction: TransactionDetailData,
  categories: readonly TransactionCategoryOption[],
  accounts: readonly TransactionAccountOption[],
  labels: TransactionEditLabels,
  locale: string,
): { readonly field: TransactionEditField; readonly label: string; readonly before: string; readonly after: string; readonly isFinancial: boolean } {
  switch (field) {
    case "amount":
      return { field, label: labels.amount, before: formatAmount(baseline.amount, transaction, locale), after: formatAmount(draft.amount, transaction, locale), isFinancial: true };
    case "account":
      return { field, label: labels.account, before: accountLabel(baseline.account, accounts, transaction, labels), after: accountLabel(draft.account, accounts, transaction, labels), isFinancial: true };
    case "fromAccount":
      return { field, label: labels.fromAccount, before: accountLabel(baseline.fromAccount, accounts, transaction, labels), after: accountLabel(draft.fromAccount, accounts, transaction, labels), isFinancial: true };
    case "toAccount":
      return { field, label: labels.toAccount, before: accountLabel(baseline.toAccount, accounts, transaction, labels), after: accountLabel(draft.toAccount, accounts, transaction, labels), isFinancial: true };
    case "counterparty":
      return { field, label: transaction.kind === "INCOME" ? labels.source : labels.merchant, before: textValue(baseline.counterparty, labels), after: textValue(draft.counterparty, labels), isFinancial: false };
    case "category":
      return { field, label: labels.category, before: categoryLabel(baseline.categoryId, categories, transaction, labels), after: categoryLabel(draft.categoryId, categories, transaction, labels), isFinancial: false };
    case "date":
      return { field, label: labels.date, before: formatTransactionFormDate(baseline.date, locale), after: formatTransactionFormDate(draft.date, locale), isFinancial: false };
    case "time":
      return { field, label: labels.time, before: textValue(baseline.time, labels), after: textValue(draft.time, labels), isFinancial: false };
    case "note":
      return { field, label: labels.note, before: textValue(baseline.note, labels), after: textValue(draft.note, labels), isFinancial: false };
  }
}

function formatAmount(value: string, transaction: TransactionDetailData, locale: string): string {
  const amount = parseTransactionEditAmount(value, transaction.amount.currency);
  return amount ? formatOverviewMoney(amount.minor, transaction.amount.currency, locale) : value;
}

function accountLabel(
  id: string,
  accounts: readonly TransactionAccountOption[],
  transaction: TransactionDetailData,
  labels: TransactionEditLabels,
): string {
  const historicAccounts = [transaction.account, transaction.transferAccount].filter(Boolean);
  const account = accounts.find((candidate) => candidate.id === id) ?? historicAccounts.find((candidate) => candidate?.id === id);
  if (!account) return labels.notProvided;
  const metadata = account.type ? labels.accountTypes[account.type] : account.currency;
  return `${account.name} · ${metadata}`;
}

function categoryLabel(
  id: string,
  categories: readonly TransactionCategoryOption[],
  transaction: TransactionDetailData,
  labels: TransactionEditLabels,
): string {
  if (!id) return labels.uncategorized;
  return categories.find((category) => category.id === id)?.name
    ?? (transaction.category?.id === id ? transaction.category.name : labels.notProvided);
}

function textValue(value: string, labels: TransactionEditLabels): string {
  return value.normalize("NFKC").trim() || labels.notProvided;
}
