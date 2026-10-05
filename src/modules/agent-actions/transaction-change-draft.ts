import { ConflictError } from "@/authorization/errors";
import type {
  LedgerAccountRecord,
  LedgerCategoryRecord,
  LedgerTransactionRecord,
} from "@/modules/ledger/domain";

import type {
  TransactionChangeDraft,
  TransactionChangeField,
  TransactionChangeSet,
  TransactionDraftKind,
} from "./domain";
import { TRANSACTION_DRAFT_KINDS } from "./domain";
import { cleanOptionalText, matchByName, parseAmountToMinor, parseOccurredAt } from "./transaction-draft";

export interface TransactionChangeIntent {
  transactionId: string;
  amountText?: string | null;
  occurredAtText?: string | null;
  accountHint?: string | null;
  transferAccountHint?: string | null;
  categoryHint?: string | null;
  merchantName?: string | null;
  note?: string | null;
  reason?: string | null;
  sourceText?: string | null;
}

export interface TransactionChangeContext {
  transaction: LedgerTransactionRecord;
  timezone: string;
  accounts: readonly LedgerAccountRecord[];
  categories: readonly LedgerCategoryRecord[];
  now?: Date;
}

/**
 * Turns a requested edit of one posted transaction into a JSON-safe draft.
 * Whether it is a safe metadata edit or a financial correction is decided
 * here from what changes, never by the model: any amount or account change
 * is FINANCIAL and can only run as a ledger correction.
 */
export function buildTransactionChangeDraft(
  intent: TransactionChangeIntent,
  context: TransactionChangeContext,
): TransactionChangeDraft {
  const { transaction } = context;
  if (!isChangeableKind(transaction.kind)) {
    throw new ConflictError("Only an expense, income, or transfer can be changed this way.");
  }
  const isTransfer = transaction.kind === "TRANSFER";
  const changes: { -readonly [Key in keyof TransactionChangeSet]: TransactionChangeSet[Key] } = {};
  const missingFields: TransactionChangeField[] = [];

  const amountText = cleanOptionalText(intent.amountText);
  if (amountText) {
    const amountMinor = parseAmountToMinor(amountText, transaction.currency);
    if (!amountMinor) missingFields.push("amount");
    else if (amountMinor !== transaction.amountMinor.toString()) changes.amountMinor = amountMinor;
  }

  if (cleanOptionalText(intent.occurredAtText)) {
    const occurredAt = parseOccurredAt(intent.occurredAtText, context.timezone, context.now ?? new Date());
    if (!occurredAt) missingFields.push("date");
    else changes.occurredOn = occurredAt.slice(0, 10);
  }

  if (cleanOptionalText(intent.accountHint)) {
    const account = matchByName(intent.accountHint, context.accounts);
    if (!account) missingFields.push("account");
    else if (account.id !== transaction.accountId) changes.accountId = account.id;
  }

  if (cleanOptionalText(intent.transferAccountHint)) {
    if (!isTransfer) throw new ConflictError("Only a transfer has a destination account.");
    const account = matchByName(intent.transferAccountHint, context.accounts);
    if (!account) missingFields.push("destinationAccount");
    else if (account.id !== transaction.transferAccountId) changes.transferAccountId = account.id;
  }

  if (cleanOptionalText(intent.categoryHint)) {
    if (isTransfer) throw new ConflictError("A transfer has no category.");
    const category = matchByName(
      intent.categoryHint,
      context.categories.filter((candidate) => candidate.kind === transaction.kind),
    );
    if (!category) missingFields.push("category");
    else if (category.id !== transaction.categoryId) changes.categoryId = category.id;
  }

  const merchantName = cleanOptionalText(intent.merchantName);
  if (merchantName) {
    if (isTransfer) throw new ConflictError("A transfer has no merchant.");
    changes.merchantName = merchantName;
  }

  const note = cleanOptionalText(intent.note);
  if (note && note !== transaction.note) changes.note = note;

  if (missingFields.length === 0 && Object.keys(changes).length === 0) missingFields.push("change");

  return {
    changeType:
      changes.amountMinor !== undefined || changes.accountId !== undefined || changes.transferAccountId !== undefined
        ? "FINANCIAL"
        : "DETAILS",
    transactionId: transaction.id,
    transactionKind: transaction.kind,
    expectedUpdatedAt: transaction.updatedAt.toISOString(),
    currency: transaction.currency,
    current: {
      amountMinor: transaction.amountMinor.toString(),
      accountId: transaction.accountId,
      transferAccountId: transaction.transferAccountId,
      categoryId: transaction.categoryId,
      occurredAt: transaction.occurredAt.toISOString(),
    },
    changes,
    amountText,
    reason: cleanOptionalText(intent.reason),
    sourceText: cleanOptionalText(intent.sourceText),
    missingFields,
  };
}

export function transactionChangeDetailsPatch(draft: TransactionChangeDraft): Record<string, unknown> {
  const { changes } = draft;
  return {
    ...(changes.categoryId === undefined ? {} : { categoryId: changes.categoryId }),
    ...(changes.merchantName === undefined
      ? {}
      : { [draft.transactionKind === "INCOME" ? "source" : "merchant"]: changes.merchantName }),
    ...(changes.note === undefined ? {} : { note: changes.note }),
    ...(changes.occurredOn === undefined ? {} : { occurredAt: { date: changes.occurredOn } }),
  };
}

function isChangeableKind(
  kind: LedgerTransactionRecord["kind"],
): kind is TransactionDraftKind {
  return (TRANSACTION_DRAFT_KINDS as readonly string[]).includes(kind);
}
