import { z } from "zod";

import { AuthorizationError } from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { isCurrencyCode, toCurrencyCode, type CurrencyCode } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";

import { LEDGER_ACCOUNT_TYPES, type LedgerAccountType, type LedgerAccountRecord } from "./domain";
import { LedgerService } from "./ledger-service";
import { getLedgerService } from "./server";

const workspaceIdSchema = z.string().trim().min(1).max(255);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isCurrencyCode, "Currency must be a supported ISO 4217 monetary currency code.");

/** The sole untrusted-input contract for manual account creation. */
export const createAccountSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    name: z.string().trim().min(1).max(120),
    type: z.enum(LEDGER_ACCOUNT_TYPES),
    currency: currencySchema,
    openingBalance: z.string().trim().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.openingBalance || !isCurrencyCode(value.currency)) return;
    if (!parseDecimalMoney(value.openingBalance, value.currency)) {
      context.addIssue({
        code: "custom",
        path: ["openingBalance"],
        message: "Opening balance must be an exact decimal amount for the selected currency.",
      });
    }
  });

export type CreateAccountInput = z.input<typeof createAccountSchema>;
export type CreatedAccountDTO = {
  readonly id: string;
  readonly name: string;
  readonly type: LedgerAccountType;
  readonly currency: CurrencyCode;
};

export type CreateAccountErrorCode =
  | "UNAUTHENTICATED"
  | "WORKSPACE_FORBIDDEN"
  | "INVALID_ACCOUNT_NAME"
  | "INVALID_ACCOUNT_TYPE"
  | "INVALID_CURRENCY"
  | "INVALID_OPENING_BALANCE"
  | "ACCOUNT_CREATE_FAILED";

export type CreateAccountResult =
  | { readonly ok: true; readonly account: CreatedAccountDTO }
  | { readonly ok: false; readonly code: CreateAccountErrorCode };

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

  const openingBalance = parsed.data.openingBalance
    ? parseDecimalMoney(parsed.data.openingBalance, parsed.data.currency)
    : parseDecimalMoney("0", parsed.data.currency);
  // The schema has already proved this, but retain an explicit boundary should
  // the schema evolve separately from the exact-money parser.
  if (!openingBalance) return { ok: false, code: "INVALID_OPENING_BALANCE" };

  try {
    const account = await ledger.createAccount(actor, parsed.data.workspaceId, {
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      openingBalanceMinor: openingBalance.minor,
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

function validationErrorCode(error: z.ZodError): CreateAccountErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("openingBalance")) return "INVALID_OPENING_BALANCE";
  if (fields.has("currency")) return "INVALID_CURRENCY";
  if (fields.has("type")) return "INVALID_ACCOUNT_TYPE";
  return "INVALID_ACCOUNT_NAME";
}
