import { getCurrencyExponent } from "@/money/currency";
import { money, parseDecimalMoney, toDecimalString } from "@/money/money";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionAccountOption } from "@/modules/transactions/domain/transaction-account-options";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";

import { formatManualTransactionDate } from "./manual-transaction-create-flow";
import { getTransactionFormDateTime } from "./transaction-date-field";

export type TransactionEditDraft = {
  readonly amount: string;
  readonly account: string;
  readonly counterparty: string;
  readonly categoryId: string;
  readonly date: Date;
  readonly fromAccount: string;
  readonly time: string;
  readonly toAccount: string;
  readonly note: string;
};

export type TransactionEditField =
  | "amount"
  | "account"
  | "counterparty"
  | "category"
  | "date"
  | "fromAccount"
  | "time"
  | "toAccount"
  | "note";

export type TransactionEditChangeClassification = {
  readonly hasChanges: boolean;
  readonly hasMetadataChanges: boolean;
  readonly hasFinancialChanges: boolean;
  readonly metadataFields: readonly TransactionEditField[];
  readonly financialFields: readonly TransactionEditField[];
};

export type TransactionEditSubmissionIntent = "none" | "safe-edit" | "review-correction" | "financial-not-allowed";

export type TransactionEditFieldErrors = Partial<Record<TransactionEditField, string>>;
export type TransactionEditFormError = "concurrent" | "notAllowed" | "financialNotAllowed" | "failed" | null;

export type TransactionEditCommand = {
  readonly workspaceId: string;
  readonly transactionId: string;
  readonly expectedUpdatedAt: string;
  readonly patch: Record<string, unknown>;
};

export type TransactionCorrectionCommand = {
  readonly workspaceId: string;
  readonly transactionId: string;
  readonly expectedUpdatedAt: string;
  readonly idempotencyKey: string;
  readonly kind: "EXPENSE" | "INCOME" | "TRANSFER";
  readonly financialChanges: Record<string, string>;
  readonly details?: Record<string, unknown>;
  readonly reason?: string;
};

export type TransactionCorrectionFormError =
  | "account"
  | "amount"
  | "conflict"
  | "currency"
  | "failed"
  | "insufficientFunds"
  | "notAllowed"
  | "refundLimit"
  | "transfer"
  | null;

export function createTransactionEditDraft(
  transaction: TransactionDetailData,
  timeZone: string,
): TransactionEditDraft {
  const occurredAt = getTransactionFormDateTime(transaction.occurredAt, timeZone);
  return {
    amount: toDecimalString(money(transaction.amount.currency, BigInt(transaction.amount.minor))),
    account: transaction.account?.id ?? "",
    counterparty: transaction.merchant?.name ?? "",
    categoryId: transaction.category?.id ?? "",
    date: occurredAt.date,
    fromAccount: transaction.account?.id ?? "",
    time: occurredAt.time,
    toAccount: transaction.transferAccount?.id ?? "",
    note: transaction.note ?? "",
  };
}


export function classifyTransactionChanges(
  original: TransactionEditDraft,
  draft: TransactionEditDraft,
  input: Pick<TransactionDetailData, "amount" | "kind">,
): TransactionEditChangeClassification {
  const metadataFields: TransactionEditField[] = [];
  const financialFields: TransactionEditField[] = [];

  if (original.date.getTime() !== draft.date.getTime()) metadataFields.push("date");
  if (original.time !== draft.time) metadataFields.push("time");
  if (nullableText(original.note) !== nullableText(draft.note)) metadataFields.push("note");

  if (input.kind === "EXPENSE" || input.kind === "INCOME") {
    if (nullableText(original.counterparty) !== nullableText(draft.counterparty)) metadataFields.push("counterparty");
    if (original.categoryId !== draft.categoryId) metadataFields.push("category");
    if (!areTransactionEditAmountsEqual(original.amount, draft.amount, input.amount.currency)) financialFields.push("amount");
    if (original.account !== draft.account) financialFields.push("account");
  }

  if (input.kind === "TRANSFER") {
    if (!areTransactionEditAmountsEqual(original.amount, draft.amount, input.amount.currency)) financialFields.push("amount");
    if (original.fromAccount !== draft.fromAccount) financialFields.push("fromAccount");
    if (original.toAccount !== draft.toAccount) financialFields.push("toAccount");
  }

  return {
    hasChanges: metadataFields.length > 0 || financialFields.length > 0,
    hasMetadataChanges: metadataFields.length > 0,
    hasFinancialChanges: financialFields.length > 0,
    metadataFields,
    financialFields,
  };
}

/** Resolves the only allowed client transition; financial drafts can never fall through to safe edit. */
export function getTransactionEditSubmissionIntent(
  classification: TransactionEditChangeClassification,
  canCorrectFinancials: boolean,
): TransactionEditSubmissionIntent {
  if (!classification.hasChanges) return "none";
  if (!classification.hasFinancialChanges) return "safe-edit";
  return canCorrectFinancials ? "review-correction" : "financial-not-allowed";
}

export function parseTransactionEditAmount(value: string, currency: string) {
  return parseDecimalMoney(normalizeMoneyInput(value, currency), currency);
}

export function createTransactionEditCommand(
  workspaceId: string,
  transaction: TransactionDetailData,
  timeZone: string,
  draft: TransactionEditDraft,
): TransactionEditCommand {
  const initial = createTransactionEditDraft(transaction, timeZone);
  const patch: Record<string, unknown> = {};

  if (initial.date.getTime() !== draft.date.getTime() || initial.time !== draft.time) {
    patch.occurredAt = {
      date: formatManualTransactionDate(draft.date),
      time: draft.time || null,
    };
  }

  if (nullableText(initial.note) !== nullableText(draft.note)) {
    patch.note = nullableText(draft.note);
  }

  if (transaction.kind === "EXPENSE" || transaction.kind === "INCOME") {
    if (initial.categoryId !== draft.categoryId) {
      patch.categoryId = draft.categoryId || null;
    }
    if (nullableText(initial.counterparty) !== nullableText(draft.counterparty)) {
      patch[transaction.kind === "EXPENSE" ? "merchant" : "source"] = nullableText(draft.counterparty);
    }
  }

  return {
    workspaceId,
    transactionId: transaction.id,
    expectedUpdatedAt: transaction.updatedAt,
    patch,
  };
}


export function createTransactionCorrectionCommand(
  workspaceId: string,
  transaction: TransactionDetailData,
  baseline: TransactionEditDraft,
  draft: TransactionEditDraft,
  idempotencyKey: string,
  reason: string,
): TransactionCorrectionCommand | null {
  if (transaction.kind === "REFUND") return null;
  const classification = classifyTransactionChanges(baseline, draft, transaction);
  if (!classification.hasFinancialChanges) return null;

  const financialChanges: Record<string, string> = {};
  const details: Record<string, unknown> = {};
  const initialAmount = parseTransactionEditAmount(baseline.amount, transaction.amount.currency);
  const finalAmount = parseTransactionEditAmount(draft.amount, transaction.amount.currency);
  if (!initialAmount || !finalAmount || finalAmount.minor <= 0n) return null;

  if (initialAmount.minor !== finalAmount.minor) financialChanges.amountMinor = finalAmount.minor.toString();
  if (baseline.date.getTime() !== draft.date.getTime() || baseline.time !== draft.time) {
    details.occurredAt = {
      date: formatManualTransactionDate(draft.date),
      time: draft.time || null,
    };
  }
  if (nullableText(baseline.note) !== nullableText(draft.note)) details.note = nullableText(draft.note);

  if (transaction.kind === "EXPENSE" || transaction.kind === "INCOME") {
    if (baseline.account !== draft.account) financialChanges.accountId = draft.account;
    if (baseline.categoryId !== draft.categoryId) details.categoryId = draft.categoryId || null;
    if (nullableText(baseline.counterparty) !== nullableText(draft.counterparty)) {
      details[transaction.kind === "EXPENSE" ? "merchant" : "source"] = nullableText(draft.counterparty);
    }
  } else {
    if (baseline.fromAccount !== draft.fromAccount) financialChanges.fromAccountId = draft.fromAccount;
    if (baseline.toAccount !== draft.toAccount) financialChanges.toAccountId = draft.toAccount;
  }

  if (Object.keys(financialChanges).length === 0) return null;

  const correctionReason = nullableText(reason);
  return {
    workspaceId,
    transactionId: transaction.id,
    expectedUpdatedAt: transaction.updatedAt,
    idempotencyKey,
    kind: transaction.kind,
    financialChanges,
    ...(Object.keys(details).length > 0 ? { details } : {}),
    ...(correctionReason ? { reason: correctionReason } : {}),
  };
}

export function isTransactionEditDirty(
  transaction: TransactionDetailData,
  timeZone: string,
  draft: TransactionEditDraft,
): boolean {
  return classifyTransactionChanges(createTransactionEditDraft(transaction, timeZone), draft, transaction).hasChanges;
}

export function validateTransactionEditDraft(
  transaction: TransactionDetailData,
  draft: TransactionEditDraft,
  categories: readonly TransactionCategoryOption[],
  labels: {
    readonly amountInvalid: string;
    readonly amountPositive: string;
    readonly counterpartyTooLong: string;
    readonly accountUnavailable: string;
    readonly fromAccountRequired: string;
    readonly invalidCategory: string;
    readonly invalidDate: string;
    readonly invalidTime: string;
    readonly noteTooLong: string;
    readonly sameTransferAccount: string;
    readonly toAccountRequired: string;
  },
  accounts?: readonly TransactionAccountOption[],
): TransactionEditFieldErrors {
  const errors: TransactionEditFieldErrors = {};

  if (Number.isNaN(draft.date.getTime())) errors.date = labels.invalidDate;
  if (draft.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) errors.time = labels.invalidTime;
  if (draft.note.normalize("NFKC").trim().length > 1_000) errors.note = labels.noteTooLong;

  if (accounts) {
    const amount = parseTransactionEditAmount(draft.amount, transaction.amount.currency);
    if (!amount) errors.amount = labels.amountInvalid;
    else if (amount.minor <= 0n) errors.amount = labels.amountPositive;
  }

  if (transaction.kind === "EXPENSE" || transaction.kind === "INCOME") {
    if (draft.counterparty.normalize("NFKC").trim().length > 160) {
      errors.counterparty = labels.counterpartyTooLong;
    }
    if (
      draft.categoryId
      && !categories.some((category) => category.id === draft.categoryId && category.kind === transaction.kind)
    ) {
      errors.category = labels.invalidCategory;
    }
    if (accounts && !isCompatibleAccount(draft.account, accounts, transaction.amount.currency)) {
      errors.account = labels.accountUnavailable;
    }
  }

  if (transaction.kind === "TRANSFER") {
    if (!draft.fromAccount) errors.fromAccount = labels.fromAccountRequired;
    else if (accounts && !isCompatibleAccount(draft.fromAccount, accounts, transaction.amount.currency)) {
      errors.fromAccount = labels.accountUnavailable;
    }

    if (!draft.toAccount) errors.toAccount = labels.toAccountRequired;
    else if (draft.fromAccount === draft.toAccount) errors.toAccount = labels.sameTransferAccount;
    else if (accounts && !isCompatibleAccount(draft.toAccount, accounts, transaction.amount.currency)) {
      errors.toAccount = labels.accountUnavailable;
    }
  }

  return errors;
}

function areTransactionEditAmountsEqual(left: string, right: string, currency: string): boolean {
  const leftMoney = parseTransactionEditAmount(left, currency);
  const rightMoney = parseTransactionEditAmount(right, currency);
  if (leftMoney && rightMoney) return leftMoney.minor === rightMoney.minor;
  return left.normalize("NFKC").trim() === right.normalize("NFKC").trim();
}

function isCompatibleAccount(
  id: string,
  accounts: readonly TransactionAccountOption[],
  currency: string,
): boolean {
  return accounts.some((account) => account.id === id && account.currency === currency);
}

function normalizeMoneyInput(value: string, currency: string): string {
  const compact = value.normalize("NFKC").trim().replaceAll(/[\s\u00a0\u202f]/g, "");
  const exponent = getCurrencyExponent(currency);
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    return compact.replaceAll(grouping, "").replace(decimal, ".");
  }

  const separator = comma >= 0 ? "," : dot >= 0 ? "." : null;
  if (!separator) return compact;

  const fractionLength = compact.length - compact.lastIndexOf(separator) - 1;
  if (exponent > 0 && fractionLength > 0 && fractionLength <= exponent) {
    return separator === "," ? compact.replace(",", ".") : compact;
  }

  return compact.replaceAll(separator, "");
}

export function mapTransactionEditFailure(code: string | undefined): {
  readonly fieldErrors: TransactionEditFieldErrors;
  readonly formError: TransactionEditFormError;
} {
  switch (code) {
    case "INVALID_CATEGORY":
    case "CATEGORY_NOT_ALLOWED":
      return { fieldErrors: { category: "category" }, formError: null };
    case "INVALID_COUNTERPARTY":
      return { fieldErrors: { counterparty: "counterparty" }, formError: null };
    case "INVALID_OCCURRED_AT":
      return { fieldErrors: { date: "date", time: "time" }, formError: null };
    case "CONCURRENT_MODIFICATION":
      return { fieldErrors: {}, formError: "concurrent" };
    case "TRANSACTION_EDIT_NOT_ALLOWED":
      return { fieldErrors: {}, formError: "notAllowed" };
    default:
      return { fieldErrors: {}, formError: "failed" };
  }
}

export function mapTransactionCorrectionFailure(code: string | undefined): {
  readonly fieldErrors: TransactionEditFieldErrors;
  readonly formError: TransactionCorrectionFormError;
} {
  return mapTransactionCorrectionFailureForKind(code);
}

export function mapTransactionCorrectionFailureForKind(
  code: string | undefined,
  kind?: TransactionDetailData["kind"],
): {
  readonly fieldErrors: TransactionEditFieldErrors;
  readonly formError: TransactionCorrectionFormError;
} {
  const accountFields = kind === "TRANSFER"
    ? { fromAccount: "fromAccount" as const, toAccount: "toAccount" as const }
    : { account: "account" as const };
  switch (code) {
    case "INSUFFICIENT_FUNDS":
      return { fieldErrors: { amount: "amount" }, formError: "insufficientFunds" };
    case "INVALID_AMOUNT":
      return { fieldErrors: { amount: "amount" }, formError: "amount" };
    case "CORRECTED_AMOUNT_BELOW_REFUNDED_TOTAL":
      return { fieldErrors: { amount: "refundLimit" }, formError: "refundLimit" };
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_UNAVAILABLE":
    case "ACCOUNT_WORKSPACE_MISMATCH":
      return { fieldErrors: accountFields, formError: "account" };
    case "SAME_TRANSFER_ACCOUNT":
      return { fieldErrors: { toAccount: "toAccount" }, formError: "transfer" };
    case "CROSS_CURRENCY_TRANSFER_UNSUPPORTED":
    case "CURRENCY_MISMATCH":
      return { fieldErrors: accountFields, formError: "currency" };
    case "INVALID_CATEGORY":
    case "CATEGORY_NOT_ALLOWED":
      return { fieldErrors: { category: "category" }, formError: "failed" };
    case "INVALID_COUNTERPARTY":
      return { fieldErrors: { counterparty: "counterparty" }, formError: "failed" };
    case "INVALID_OCCURRED_AT":
      return { fieldErrors: { date: "date", time: "time" }, formError: "failed" };
    case "TRANSACTION_CORRECTION_NOT_ALLOWED":
      return { fieldErrors: {}, formError: "notAllowed" };
    case "TRANSACTION_ALREADY_REVERSED":
    case "TRANSACTION_NOT_CURRENT":
    case "CONCURRENT_MODIFICATION":
      return { fieldErrors: {}, formError: "conflict" };
    default:
      return { fieldErrors: {}, formError: "failed" };
  }
}

export function transactionEditErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function correctionReplacementTransactionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const correction = (payload as { readonly correction?: unknown }).correction;
  if (!correction || typeof correction !== "object" || Array.isArray(correction)) return null;
  const replacement = (correction as { readonly replacementTransaction?: unknown }).replacementTransaction;
  if (!replacement || typeof replacement !== "object" || Array.isArray(replacement)) return null;
  const id = (replacement as { readonly id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function nullableText(value: string): string | null {
  const normalized = value.normalize("NFKC").trim();
  return normalized || null;
}
