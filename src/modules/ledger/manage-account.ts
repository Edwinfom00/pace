import { z } from "zod";

import {
  AuthorizationError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { LedgerAccountRecord } from "./domain";
import { LedgerService } from "./ledger-service";
import {
  accountManagementValidationErrorCode,
  manageAccountSchema,
  type ManageAccountErrorCode,
  type ManageAccountResult,
  type ManagedAccountDTO,
} from "./manage-account-contract";
import { DatabaseLedgerRepository } from "./repositories/ledger-repository";

export {
  manageAccountSchema,
  type ManageAccountErrorCode,
  type ManageAccountInput,
  type ManageAccountResult,
  type ManagedAccountDTO,
} from "./manage-account-contract";

type ManageAccountDependencies = Pick<LedgerService, "manageAccount">;

/** Server boundary for every existing-account lifecycle operation. */
export async function manageAccount(input: unknown): Promise<ManageAccountResult> {
  const records = new DatabaseLedgerRepository();
  return manageAccountForActor(await getAuthenticatedActor(), input, {
    ledger: new LedgerService(records, new DatabaseWorkspaceRepository()),
  });
}

/** Injectable server/domain entry point; actor must originate from the session. */
export async function manageAccountForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: { readonly ledger: ManageAccountDependencies },
): Promise<ManageAccountResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = manageAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: accountManagementValidationErrorCode(parsed.error) };

  try {
    const account = await dependencies.ledger.manageAccount(actor, parsed.data);
    return { ok: true, account: presentManagedAccount(account) };
  } catch (error) {
    return { ok: false, code: accountManagementErrorCode(error) };
  }
}

function presentManagedAccount(account: LedgerAccountRecord): ManagedAccountDTO {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    archivedAt: account.archivedAt?.toISOString() ?? null,
    updatedAt: account.updatedAt.toISOString(),
  };
}

function accountManagementErrorCode(error: unknown): ManageAccountErrorCode {
  if (error instanceof z.ZodError) return accountManagementValidationErrorCode(error);
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) return "ACCOUNT_NOT_FOUND";
  if (error instanceof DomainConflictError && isManageAccountErrorCode(error.code)) return error.code;
  return "ACCOUNT_MANAGEMENT_FAILED";
}

function isManageAccountErrorCode(value: string): value is Extract<
  ManageAccountErrorCode,
  | "ACCOUNT_MANAGEMENT_NOT_ALLOWED"
  | "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED"
  | "ACCOUNT_HAS_FINANCIAL_ACTIVITY"
  | "ACCOUNT_ALREADY_ARCHIVED"
  | "ACCOUNT_NOT_ARCHIVED"
  | "ACCOUNT_UNAVAILABLE"
  | "ACCOUNT_WORKSPACE_MISMATCH"
  | "CONCURRENT_MODIFICATION"
  | "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT"
> {
  return new Set<string>([
    "ACCOUNT_MANAGEMENT_NOT_ALLOWED",
    "ACCOUNT_TYPE_CHANGE_NOT_ALLOWED",
    "ACCOUNT_HAS_FINANCIAL_ACTIVITY",
    "ACCOUNT_ALREADY_ARCHIVED",
    "ACCOUNT_NOT_ARCHIVED",
    "ACCOUNT_UNAVAILABLE",
    "ACCOUNT_WORKSPACE_MISMATCH",
    "CONCURRENT_MODIFICATION",
    "ACCOUNT_MANAGEMENT_IDEMPOTENCY_CONFLICT",
  ]).has(value);
}
