import {
  AuthorizationError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";

import {
  correctOpeningBalanceSchema,
  type CorrectOpeningBalanceErrorCode,
  type CorrectOpeningBalanceResult,
} from "./opening-balance-contract";
import { LedgerService } from "./ledger-service";
import { getLedgerService } from "./server";

export async function correctOpeningBalance(input: unknown): Promise<CorrectOpeningBalanceResult> {
  return correctOpeningBalanceForActor(await getAuthenticatedActor(), input, getLedgerService());
}

export async function correctOpeningBalanceForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  ledger: Pick<LedgerService, "correctOpeningBalance">,
): Promise<CorrectOpeningBalanceResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };
  const parsed = correctOpeningBalanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_OPENING_BALANCE" };
  try {
    return { ok: true, openingBalance: await ledger.correctOpeningBalance(actor, parsed.data) };
  } catch (error) {
    return { ok: false, code: correctOpeningBalanceErrorCode(error) };
  }
}

function correctOpeningBalanceErrorCode(error: unknown): CorrectOpeningBalanceErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) {
    return error.message.startsWith("Opening balance") ? "OPENING_BALANCE_NOT_FOUND" : "ACCOUNT_NOT_FOUND";
  }
  if (error instanceof DomainConflictError && isCode(error.code)) return error.code;
  return "OPENING_BALANCE_CORRECTION_FAILED";
}

function isCode(value: string): value is Exclude<CorrectOpeningBalanceErrorCode,
  "UNAUTHENTICATED" | "WORKSPACE_FORBIDDEN" | "ACCOUNT_NOT_FOUND" | "OPENING_BALANCE_NOT_FOUND" | "OPENING_BALANCE_CORRECTION_FAILED" | "INVALID_OPENING_BALANCE"
> {
  return new Set<string>([
    "ACCOUNT_WORKSPACE_MISMATCH",
    "ACCOUNT_UNAVAILABLE",
    "NEGATIVE_OPENING_BALANCE_NOT_ALLOWED",
    "CONCURRENT_MODIFICATION",
    "OPENING_BALANCE_ALREADY_PROCESSED",
  ]).has(value);
}
