import {
  LEDGER_ACCOUNT_TYPES,
  type LedgerAccountType,
} from "@/modules/ledger/domain";

export type AccountManagementDraft = {
  readonly name: string;
  readonly type: LedgerAccountType;
};

export type AccountManagementSnapshot = AccountManagementDraft & {
  readonly updatedAt: string;
};

export type AccountManagementRequest =
  | {
    readonly action: "RENAME";
    readonly name: string;
    readonly expectedUpdatedAt: string;
    readonly idempotencyKey: string;
  }
  | {
    readonly action: "CHANGE_TYPE";
    readonly type: LedgerAccountType;
    readonly expectedUpdatedAt: string;
    readonly idempotencyKey: string;
  }
  | {
    readonly action: "ARCHIVE" | "RESTORE";
    readonly expectedUpdatedAt: string;
    readonly idempotencyKey: string;
  };

export type ManagedAccountResponse = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: string;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
};

export type AccountManagementField = "name" | "type";
export type AccountManagementFormError = "failed" | "notAllowed" | "conflict";

export type AccountManagementFailure = {
  readonly field?: AccountManagementField;
  readonly formError: AccountManagementFormError;
};

export function createAccountManagementDraft(snapshot: Pick<AccountManagementSnapshot, "name" | "type">): AccountManagementDraft {
  return { name: snapshot.name, type: snapshot.type };
}

export function normalizedAccountName(name: string): string {
  return name.trim();
}

export function accountManagementChanges(
  snapshot: AccountManagementSnapshot,
  draft: AccountManagementDraft,
  capabilities: { readonly canRename: boolean; readonly canChangeType: boolean },
) {
  return {
    name: capabilities.canRename && normalizedAccountName(draft.name) !== snapshot.name,
    type: capabilities.canChangeType && draft.type !== snapshot.type,
  };
}

export function validateAccountManagementDraft(
  draft: AccountManagementDraft,
  capabilities: { readonly canRename: boolean },
): Partial<Record<AccountManagementField, "invalid" | "tooLong">> {
  if (!capabilities.canRename) return {};
  const name = normalizedAccountName(draft.name);
  if (!name) return { name: "invalid" };
  if (name.length > 120) return { name: "tooLong" };
  return {};
}

export function createRenameAccountRequest(
  name: string,
  expectedUpdatedAt: string,
  idempotencyKey: string,
): AccountManagementRequest {
  return {
    action: "RENAME",
    name: normalizedAccountName(name),
    expectedUpdatedAt,
    idempotencyKey,
  };
}

export function createChangeAccountTypeRequest(
  type: LedgerAccountType,
  expectedUpdatedAt: string,
  idempotencyKey: string,
): AccountManagementRequest {
  return { action: "CHANGE_TYPE", type, expectedUpdatedAt, idempotencyKey };
}

export function createAccountLifecycleRequest(
  action: "ARCHIVE" | "RESTORE",
  expectedUpdatedAt: string,
  idempotencyKey: string,
): AccountManagementRequest {
  return { action, expectedUpdatedAt, idempotencyKey };
}

export function mapAccountManagementFailure(code: string | undefined): AccountManagementFailure {
  switch (code) {
    case "INVALID_ACCOUNT_NAME":
      return { field: "name", formError: "failed" };
    case "INVALID_ACCOUNT_TYPE":
      return { field: "type", formError: "failed" };
    case "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED":
    case "ACCOUNT_HAS_FINANCIAL_ACTIVITY":
      return { field: "type", formError: "notAllowed" };
    case "ACCOUNT_MANAGEMENT_NOT_ALLOWED":
    case "ACCOUNT_ALREADY_ARCHIVED":
    case "ACCOUNT_NOT_ARCHIVED":
    case "ACCOUNT_UNAVAILABLE":
      return { formError: "notAllowed" };
    case "CONCURRENT_MODIFICATION":
      return { formError: "conflict" };
    case "ACCOUNT_NOT_FOUND":
    case "ACCOUNT_WORKSPACE_MISMATCH":
    case "WORKSPACE_FORBIDDEN":
    case "UNAUTHENTICATED":
    case "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT":
    case "INVALID_ACCOUNT_MANAGEMENT_COMMAND":
    case "ACCOUNT_MANAGEMENT_FAILED":
    default:
      return { formError: "failed" };
  }
}

export function accountManagementErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const code = (payload as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function parseManagedAccountResponse(payload: unknown): ManagedAccountResponse | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const account = (payload as { readonly account?: unknown }).account;
  if (!account || typeof account !== "object" || Array.isArray(account)) return null;
  const value = account as Record<string, unknown>;
  if (
    typeof value.id !== "string"
    || typeof value.name !== "string"
    || typeof value.currency !== "string"
    || typeof value.updatedAt !== "string"
    || (value.archivedAt !== null && typeof value.archivedAt !== "string")
    || typeof value.type !== "string"
    || !LEDGER_ACCOUNT_TYPES.includes(value.type as LedgerAccountType)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    type: value.type as LedgerAccountType,
    currency: value.currency,
    archivedAt: value.archivedAt,
    updatedAt: value.updatedAt,
  };
}
