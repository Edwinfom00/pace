import { z } from "zod";

import { isCurrencyCode } from "@/money/currency";

export const TRANSACTION_FORM_VALIDATION_ERROR_CODES = {
  amountRequired: "transactions.validation.amountRequired",
  amountInvalid: "transactions.validation.amountInvalid",
  amountPositive: "transactions.validation.amountPositive",
  currencyRequired: "transactions.validation.currencyRequired",
  currencyUnsupported: "transactions.validation.currencyUnsupported",
  accountRequired: "transactions.validation.accountRequired",
  accountUnavailable: "transactions.validation.accountUnavailable",
  categoryUnavailable: "transactions.validation.categoryUnavailable",
  dateRequired: "transactions.validation.dateRequired",
  invalidDate: "transactions.validation.invalidDate",
  invalidTime: "transactions.validation.invalidTime",
  noteTooLong: "transactions.validation.noteTooLong",
  optionalTextBlank: "transactions.validation.optionalTextBlank",
  optionalTextTooLong: "transactions.validation.optionalTextTooLong",
  fromAccountRequired: "transactions.validation.fromAccountRequired",
  toAccountRequired: "transactions.validation.toAccountRequired",
  sameTransferAccount: "transactions.validation.sameTransferAccount",
  crossCurrencyTransferUnsupported: "transactions.validation.crossCurrencyTransferUnsupported",
} as const;

export type TransactionFormValidationErrorCode =
  (typeof TRANSACTION_FORM_VALIDATION_ERROR_CODES)[keyof typeof TRANSACTION_FORM_VALIDATION_ERROR_CODES];

export const transactionFormKinds = ["EXPENSE", "INCOME", "TRANSFER"] as const;
export type TransactionFormKind = (typeof transactionFormKinds)[number];

export type TransactionFormCommonDraft = {
  readonly amount: string;
  readonly currency: string;
  readonly date: Date;
  readonly note: string;
  readonly time: string;
};

export type AccountTransactionFormDraft = TransactionFormCommonDraft & {
  readonly account: string;
};

export type ExpenseTransactionFormDraft = AccountTransactionFormDraft & {
  readonly category: string;
  readonly merchant: string;
};

export type IncomeTransactionFormDraft = AccountTransactionFormDraft & {
  readonly category: string;
  readonly source: string;
};

export type TransferTransactionFormDraft = TransactionFormCommonDraft & {
  readonly fromAccount: string;
  readonly toAccount: string;
};

export type TransactionFormDraft = {
  readonly expense: ExpenseTransactionFormDraft;
  readonly income: IncomeTransactionFormDraft;
  readonly kind: TransactionFormKind;
  readonly transfer: TransferTransactionFormDraft;
};

const amountGroupingPattern = /^(?:\d+|\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,4})?|\d{1,3}(?: \d{3})+(?:[.,]\d{1,4})?)(?:[.,]\d{1,4})?$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const amount = z.string().superRefine((value, context) => {
  const normalized = value.trim();

  if (!normalized) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.amountRequired });
    return;
  }

  if (normalized.startsWith("-")) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.amountPositive });
    return;
  }

  if (!amountGroupingPattern.test(normalized)) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.amountInvalid });
    return;
  }

  if (!/[1-9]/.test(normalized.replaceAll(/[., ]/g, ""))) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.amountPositive });
  }
}).transform((value) => value.trim());

const currency = z.string().superRefine((value, context) => {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.currencyRequired });
  } else if (!isCurrencyCode(normalized)) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.currencyUnsupported });
  }
}).transform((value) => value.trim().toUpperCase());

const date = z.date({
  error: (issue) => issue.input === undefined || issue.input === null
    ? TRANSACTION_FORM_VALIDATION_ERROR_CODES.dateRequired
    : TRANSACTION_FORM_VALIDATION_ERROR_CODES.invalidDate,
}).refine((value) => !Number.isNaN(value.getTime()), {
  message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.invalidDate,
});

const time = z.string().superRefine((value, context) => {
  const normalized = value.trim();
  if (normalized && !timePattern.test(normalized)) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.invalidTime });
  }
}).transform((value) => value.trim());

const optionalText = (
  maxLength: number,
  tooLongMessage: TransactionFormValidationErrorCode = TRANSACTION_FORM_VALIDATION_ERROR_CODES.optionalTextTooLong,
) => z.string().superRefine((value, context) => {
  if (value.length > maxLength) {
    context.addIssue({ code: "custom", message: tooLongMessage });
  }

  if (value && !value.trim()) {
    context.addIssue({ code: "custom", message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.optionalTextBlank });
  }
}).transform((value) => value.trim());

const account = (requiredMessage: TransactionFormValidationErrorCode) => z.string().superRefine((value, context) => {
  if (!value.trim()) {
    context.addIssue({ code: "custom", message: requiredMessage });
  }
}).transform((value) => value.trim());

const optionalCategory = z.string().trim().max(160).optional();

const commonFields = {
  amount,
  currency,
  date,
  note: optionalText(500, TRANSACTION_FORM_VALIDATION_ERROR_CODES.noteTooLong),
  time,
};

const expenseFormSchema = z.object({
  kind: z.literal("EXPENSE"),
  ...commonFields,
  account: account(TRANSACTION_FORM_VALIDATION_ERROR_CODES.accountRequired),
  category: optionalCategory,
  merchant: optionalText(160),
});

const incomeFormSchema = z.object({
  kind: z.literal("INCOME"),
  ...commonFields,
  account: account(TRANSACTION_FORM_VALIDATION_ERROR_CODES.accountRequired),
  category: optionalCategory,
  source: optionalText(160),
});

const transferFormSchema = z.object({
  kind: z.literal("TRANSFER"),
  ...commonFields,
  fromAccount: account(TRANSACTION_FORM_VALIDATION_ERROR_CODES.fromAccountRequired),
  fromAccountCurrency: z.string().trim().optional(),
  toAccount: account(TRANSACTION_FORM_VALIDATION_ERROR_CODES.toAccountRequired),
  toAccountCurrency: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.fromAccount && value.toAccount && value.fromAccount === value.toAccount) {
    context.addIssue({
      code: "custom",
      message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.sameTransferAccount,
      path: ["toAccount"],
    });
  }

  if (
    value.fromAccount
    && value.toAccount
    && value.fromAccountCurrency
    && value.toAccountCurrency
    && value.fromAccountCurrency.toUpperCase() !== value.toAccountCurrency.toUpperCase()
  ) {
    context.addIssue({
      code: "custom",
      message: TRANSACTION_FORM_VALIDATION_ERROR_CODES.crossCurrencyTransferUnsupported,
      path: ["toAccount"],
    });
  }
});

export const transactionFormSchema = z.discriminatedUnion("kind", [
  expenseFormSchema,
  incomeFormSchema,
  transferFormSchema,
]);

export type ExpenseFormInput = z.input<typeof expenseFormSchema>;
export type IncomeFormInput = z.input<typeof incomeFormSchema>;
export type TransferFormInput = z.input<typeof transferFormSchema>;
export type TransactionFormInput = z.input<typeof transactionFormSchema>;

export type TransactionFormField = "amount" | "currency" | "account" | "category" | "date" | "time" | "note" | "merchant" | "source" | "fromAccount" | "toAccount";
export type TransactionFormErrors = Partial<Record<TransactionFormField, TransactionFormValidationErrorCode>>;

export type TransactionFormValidationResult =
  | { readonly isValid: true; readonly errors: TransactionFormErrors; readonly value: z.output<typeof transactionFormSchema> }
  | { readonly isValid: false; readonly errors: TransactionFormErrors };

const transactionFormFields = new Set<TransactionFormField>([
  "amount",
  "currency",
  "account",
  "category",
  "date",
  "time",
  "note",
  "merchant",
  "source",
  "fromAccount",
  "toAccount",
]);

export function validateTransactionForm(input: unknown): TransactionFormValidationResult {
  const result = transactionFormSchema.safeParse(input);
  if (result.success) return { isValid: true, errors: {}, value: result.data };

  const errors: TransactionFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && transactionFormFields.has(field as TransactionFormField)) {
      const typedField = field as TransactionFormField;
      errors[typedField] ??= issue.message as TransactionFormValidationErrorCode;
    }
  }

  return { isValid: false, errors };
}

export function getTransferDisabledAccountIds(selectedAccountId: string): readonly string[] {
  return selectedAccountId ? [selectedAccountId] : [];
}

export function getFirstInvalidTransactionFormField(kind: TransactionFormKind, errors: TransactionFormErrors): TransactionFormField | null {
  const fieldsByKind: Readonly<Record<TransactionFormKind, readonly TransactionFormField[]>> = {
    EXPENSE: ["amount", "currency", "merchant", "category", "account", "date", "time", "note"],
    INCOME: ["amount", "currency", "source", "category", "account", "date", "time", "note"],
    TRANSFER: ["amount", "currency", "fromAccount", "toAccount", "date", "time", "note"],
  };

  return fieldsByKind[kind].find((field) => Boolean(errors[field])) ?? null;
}
