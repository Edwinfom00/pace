import {
  AuthorizationError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";

import {
  setOpeningBalanceSchema,
  type OpeningBalanceDTO,
  type SetOpeningBalanceErrorCode,
  type SetOpeningBalanceResult,
} from "./opening-balance-contract";
import { LedgerService } from "./ledger-service";
import { getLedgerService } from "./server";

export * from "./opening-balance-contract";

export async function setOpeningBalance(input: unknown): Promise<SetOpeningBalanceResult> {
  return setOpeningBalanceForActor(await getAuthenticatedActor(), input, getLedgerService());
}

export async function setOpeningBalanceForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  ledger: Pick<LedgerService, "setOpeningBalance">,
): Promise<SetOpeningBalanceResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = setOpeningBalanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_OPENING_BALANCE" };
  try {
    return { ok: true, openingBalance: await ledger.setOpeningBalance(actor, parsed.data) };
  } catch (error) {
    return { ok: false, code: setOpeningBalanceErrorCode(error) };
  }
}

function setOpeningBalanceErrorCode(error: unknown): SetOpeningBalanceErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) return "ACCOUNT_NOT_FOUND";
  if (error instanceof DomainConflictError && isCode(error.code)) return error.code;
  return "OPENING_BALANCE_FAILED";
}

function isCode(value: string): value is Exclude<SetOpeningBalanceErrorCode,
  "UNAUTHENTICATED" | "WORKSPACE_FORBIDDEN" | "ACCOUNT_NOT_FOUND" | "OPENING_BALANCE_FAILED" | "INVALID_OPENING_BALANCE"
> {
  return new Set<string>([
    "ACCOUNT_WORKSPACE_MISMATCH",
    "ACCOUNT_UNAVAILABLE",
    "OPENING_BALANCE_ALREADY_EXISTS",
    "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED",
    "CURRENCY_MISMATCH",
    "OPENING_BALANCE_ALREADY_PROCESSED",
    "CONCURRENT_MODIFICATION",
  ]).has(value);
}
