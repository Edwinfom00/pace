import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import type { TransactionCategoryOption } from "@/modules/transactions/domain/transaction-category-options";

import { formatManualTransactionDate } from "./manual-transaction-create-flow";
import { getTransactionFormDateTime } from "./transaction-date-field";

export type TransactionEditDraft = {
  readonly counterparty: string;
  readonly categoryId: string;
  readonly date: Date;
  readonly time: string;
  readonly note: string;
};

export type TransactionEditField = "counterparty" | "category" | "date" | "time" | "note";
export type TransactionEditFieldErrors = Partial<Record<TransactionEditField, string>>;
export type TransactionEditFormError = "concurrent" | "notAllowed" | "failed" | null;

export type TransactionEditCommand = {
  readonly workspaceId: string;
  readonly transactionId: string;
  readonly expectedUpdatedAt: string;
  readonly patch: Record<string, unknown>;
};

export function createTransactionEditDraft(
  transaction: TransactionDetailData,
  timeZone: string,
): TransactionEditDraft {
  const occurredAt = getTransactionFormDateTime(transaction.occurredAt, timeZone);
  return {
    counterparty: transaction.merchant?.name ?? "",
    categoryId: transaction.category?.id ?? "",
    date: occurredAt.date,
    time: occurredAt.time,
    note: transaction.note ?? "",
  };
}

/** Builds the C.1A command with only type-allowed fields that actually changed. */
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

export function isTransactionEditDirty(
  transaction: TransactionDetailData,
  timeZone: string,
  draft: TransactionEditDraft,
): boolean {
  return Object.keys(createTransactionEditCommand("workspace", transaction, timeZone, draft).patch).length > 0;
}

export function validateTransactionEditDraft(
  transaction: TransactionDetailData,
  draft: TransactionEditDraft,
  categories: readonly TransactionCategoryOption[],
  labels: {
    readonly counterpartyTooLong: string;
    readonly invalidCategory: string;
    readonly invalidDate: string;
    readonly invalidTime: string;
    readonly noteTooLong: string;
  },
): TransactionEditFieldErrors {
  const errors: TransactionEditFieldErrors = {};

  if (Number.isNaN(draft.date.getTime())) errors.date = labels.invalidDate;
  if (draft.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) errors.time = labels.invalidTime;
  if (draft.note.normalize("NFKC").trim().length > 1_000) errors.note = labels.noteTooLong;

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
  }

  return errors;
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

export function transactionEditErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function nullableText(value: string): string | null {
  const normalized = value.normalize("NFKC").trim();
  return normalized || null;
}
