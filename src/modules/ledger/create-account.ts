import { AuthorizationError } from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { toCurrencyCode } from "@/money/currency";

import type { LedgerAccountRecord } from "./domain";
import { LedgerService } from "./ledger-service";
import { getLedgerService } from "./server";
import {
  createAccountSchema,
  type CreateAccountErrorCode,
  type CreatedAccountDTO,
  type CreateAccountResult,
} from "./create-account-contract";

export {
  createAccountSchema,
  type CreateAccountErrorCode,
  type CreateAccountInput,
  type CreatedAccountDTO,
  type CreateAccountResult,
} from "./create-account-contract";

type CreateAccountDependencies = Pick<LedgerService, "createAccount">;

/**
 * Canonical server operation for explicit manual accounts. The workspace id is
 * still untrusted: the ledger service checks membership and manage_ledger.
 */
export async function createAccount(input: unknown): Promise<CreateAccountResult> {
  return createAccountForActor(await getAuthenticatedActor(), input, getLedgerService());
}

/** Injectable variant for server-level tests; callers must supply a server-resolved actor. */
export async function createAccountForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  ledger: CreateAccountDependencies,
): Promise<CreateAccountResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: validationErrorCode(parsed.error) };

  try {
    const account = await ledger.createAccount(actor, parsed.data.workspaceId, {
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
    });
    return { ok: true, account: toCreatedAccountDTO(account) };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, code: "WORKSPACE_FORBIDDEN" };
    return { ok: false, code: "ACCOUNT_CREATE_FAILED" };
  }
}

export function toCreatedAccountDTO(account: LedgerAccountRecord): CreatedAccountDTO {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: toCurrencyCode(account.currency),
  };
}

function validationErrorCode(error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] }): CreateAccountErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("openingBalance")) return "OPENING_BALANCE_EFFECTIVE_AT_REQUIRED";
  if (fields.has("currency")) return "INVALID_CURRENCY";
  if (fields.has("type")) return "INVALID_ACCOUNT_TYPE";
  return "INVALID_ACCOUNT_NAME";
}
