import { NotFoundError } from "@/authorization/errors";
import {
  resolveAccountReference,
  type AccountReference,
  type AccountReferenceResolution,
} from "@/modules/accounts/domain/account-reference";
import { isCurrencyCode } from "@/money/currency";
import type { LedgerAccountRecord, LedgerAccountType } from "@/modules/ledger/domain";

import type { AccountDraft, AccountDraftAccount, AccountDraftField, AccountDraftOperation } from "./domain";
import { cleanOptionalText } from "./transaction-draft";

export interface AccountDraftIntent extends AccountReference {
  accountOperation: AccountDraftOperation;
  name?: string | null;
  type?: LedgerAccountType | null;
  currency?: string | null;
  sourceText?: string | null;
}

export interface AccountDraftContext {
  currency: string;
  accounts: readonly LedgerAccountRecord[];
}

/**
 * Turns a requested account change into a JSON-safe draft. The target account
 * is resolved here from the workspace's own accounts, never from an id or a
 * guess by the model; anything unresolved is reported as a missing field.
 */
export function buildAccountDraft(intent: AccountDraftIntent, context: AccountDraftContext): AccountDraft {
  const name = cleanOptionalText(intent.name);
  const type = intent.type ?? null;
  const sourceText = cleanOptionalText(intent.sourceText);
  const missingFields: AccountDraftField[] = [];

  if (intent.accountOperation === "CREATE") {
    const requestedCurrency = cleanOptionalText(intent.currency)?.toUpperCase() ?? null;
    const currency = requestedCurrency === null ? context.currency : isCurrencyCode(requestedCurrency) ? requestedCurrency : null;
    if (!name) missingFields.push("name");
    if (!type) missingFields.push("type");
    if (!currency) missingFields.push("currency");
    return {
      accountOperation: "CREATE",
      accountId: null,
      expectedUpdatedAt: null,
      current: null,
      name,
      type,
      currency,
      candidates: [],
      sourceText,
      missingFields,
    };
  }

  const target = resolveTarget(intent, context.accounts);
  const account = target.status === "RESOLVED" ? target.account : null;
  if (!account) missingFields.push("account");
  if (intent.accountOperation === "RENAME" && !name) missingFields.push("name");
  if (intent.accountOperation === "CHANGE_TYPE" && !type) missingFields.push("type");

  return {
    accountOperation: intent.accountOperation,
    accountId: account?.id ?? null,
    expectedUpdatedAt: account?.updatedAt.toISOString() ?? null,
    current: account ? presentDraftAccount(account) : null,
    name: intent.accountOperation === "RENAME" ? name : null,
    type: intent.accountOperation === "CHANGE_TYPE" ? type : null,
    currency: account?.currency ?? null,
    candidates: target.status === "RESOLVED" ? [] : target.candidates.map(presentDraftAccount),
    sourceText,
    missingFields,
  };
}

function resolveTarget(
  intent: AccountDraftIntent,
  accounts: readonly LedgerAccountRecord[],
): AccountReferenceResolution<LedgerAccountRecord> {
  if (intent.accountId) {
    const byId = resolveAccountReference(intent, accounts);
    if (byId.status !== "RESOLVED") throw new NotFoundError("Account not found in this workspace.");
    return byId;
  }

  const eligible =
    intent.accountOperation === "ARCHIVE"
      ? accounts.filter((account) => account.archivedAt === null)
      : intent.accountOperation === "RESTORE"
        ? accounts.filter((account) => account.archivedAt !== null)
        : accounts;
  const amongEligible = resolveAccountReference(intent, eligible);
  if (amongEligible.status !== "NOT_FOUND" || eligible.length === accounts.length) return amongEligible;

  // A name that only matches an account in the wrong state still resolves, so
  // the canonical policy can refuse with its own reason instead of "not found".
  const amongAll = resolveAccountReference(intent, accounts);
  return amongAll.status === "RESOLVED" ? amongAll : amongEligible;
}

export function presentDraftAccount(account: LedgerAccountRecord): AccountDraftAccount {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    status: account.archivedAt ? "ARCHIVED" : "ACTIVE",
  };
}

export function accountManagementCommand(workspaceId: string, actionId: string, draft: AccountDraft) {
  const base = {
    workspaceId,
    accountId: draft.accountId,
    idempotencyKey: actionId,
    expectedUpdatedAt: draft.expectedUpdatedAt ?? undefined,
  };
  switch (draft.accountOperation) {
    case "RENAME":
      return { ...base, action: "RENAME", name: draft.name };
    case "CHANGE_TYPE":
      return { ...base, action: "CHANGE_TYPE", type: draft.type };
    case "ARCHIVE":
    case "RESTORE":
      return { ...base, action: draft.accountOperation };
    case "CREATE":
      throw new Error("Account creation is not an account management command.");
  }
}
