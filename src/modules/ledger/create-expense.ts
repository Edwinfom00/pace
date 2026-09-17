import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { getCurrencyExponent, toCurrencyCode, type CurrencyCode } from "@/money/currency";
import { parseDecimalMoney } from "@/money/money";
import { zonedLocalDateTimeToInstant } from "@/money/period";
import { DatabaseWorkspaceRepository, type WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { LedgerService } from "./ledger-service";
import { getLedgerService } from "./server";
import {
  createExpenseSchema,
  type CreateExpenseErrorCode,
  type CreatedExpenseDTO,
  type CreateExpenseResult,
} from "./create-expense-contract";
import type { LedgerTransactionRecord } from "./domain";

export {
  createExpenseSchema,
  type CreateExpenseErrorCode,
  type CreatedExpenseDTO,
  type CreateExpenseResult,
} from "./create-expense-contract";
export type { CreateExpenseInput } from "./create-expense-contract";

type CreateExpenseDependencies = {
  readonly ledger: Pick<LedgerService, "createTransaction">;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};


export async function createExpense(input: unknown): Promise<CreateExpenseResult> {
  return createExpenseForActor(await getAuthenticatedActor(), input, {
    ledger: getLedgerService(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}

/** Injectable variant for server-level tests; the actor must come from a trusted server session. */
export async function createExpenseForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CreateExpenseDependencies,
): Promise<CreateExpenseResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: validationErrorCode(parsed.error) };

  const currency = toCurrencyCode(parsed.data.currency);
  const amount = parseExpenseAmount(parsed.data.amount, currency);
  if (!amount || amount.minor <= 0n) return { ok: false, code: "INVALID_AMOUNT" };

  // The context provides the timezone from a trusted workspace record. The
  // ledger service below remains the sole authority for member role checks.
  const workspace = await dependencies.workspaces.findMemberContext(parsed.data.workspaceId, actor.userId);
  if (!workspace) return { ok: false, code: "WORKSPACE_FORBIDDEN" };

  let occurredAt: Date;
  try {
    occurredAt = resolveOccurredAt(parsed.data.date, parsed.data.time ?? null, workspace.preferences.timezone);
  } catch {
    return { ok: false, code: "INVALID_OCCURRED_AT" };
  }

  try {
    const transaction = await dependencies.ledger.createTransaction(actor, parsed.data.workspaceId, {
      kind: "EXPENSE",
      status: "POSTED",
      accountId: parsed.data.accountId,
      categoryId: parsed.data.categoryId ?? undefined,
      merchantName: parsed.data.merchant ?? undefined,
      amountMinor: amount.minor,
      currency,
      occurredAt,
      source: { provider: "manual" },
      note: parsed.data.note ?? undefined,
    });
    return { ok: true, expense: toCreatedExpenseDTO(transaction) };
  } catch (error) {
    return { ok: false, code: ledgerErrorCode(error) };
  }
}

/**
 * Resolves a civil Pace form date/time deterministically. A missing time means
 * local noon, matching the date field's date-only/noon representation and
 * avoiding day-boundary shifts. Repeated DST times choose the earlier instant;
 * nonexistent local times are rejected by the shared period utility.
 */
export function resolveOccurredAt(date: string, time: string | null, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = (time ?? "12:00").split(":").map(Number);
  return zonedLocalDateTimeToInstant({ year, month, day }, { hour, minute }, timeZone);
}

/**
 * Converts a form amount to an exact canonical decimal string before handing
 * it to the existing bigint Money parser. This accepts the form's common
 * grouping forms (24,850 and 24.50) without using floating-point arithmetic.
 */
export function parseExpenseAmount(value: string, currency: CurrencyCode | string) {
  const normalized = normalizeExpenseDecimal(value, getCurrencyExponent(currency));
  return normalized ? parseDecimalMoney(normalized, currency) : null;
}

function normalizeExpenseDecimal(value: string, exponent: number): string | null {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.startsWith("+")) return null;
  if (normalized.startsWith("-")) return /^-\d+(?:\.\d+)?$/.test(normalized) ? normalized : null;
  if (!/^[\d., ]+$/.test(normalized)) return null;

  const compact = normalized.replaceAll(" ", "");
  const commas = [...compact].filter((character) => character === ",").length;
  const dots = [...compact].filter((character) => character === ".").length;
  if (!commas && !dots) return /^\d+$/.test(compact) ? compact : null;

  if (commas && dots) {
    const decimal = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    const [integer, fraction] = splitDecimal(compact, decimal);
    if (!fraction || !isGroupedInteger(integer, grouping)) return null;
    return `${integer.replaceAll(grouping, "")}.${fraction}`;
  }

  const separator = commas ? "," : ".";
  const parts = compact.split(separator);
  if (parts.some((part) => !part)) return null;
  if (parts.length > 2) {
    return isGroupedInteger(compact, separator) ? parts.join("") : null;
  }

  const [integer, fraction] = parts;
  if (!integer || !fraction || !/^\d+$/.test(integer) || !/^\d+$/.test(fraction)) return null;
  // A lone three-digit suffix is unambiguously treated as familiar thousands
  // grouping, so 24,850 remains 24,850 even for a three-decimal currency.
  if (fraction.length === 3 && isGroupedInteger(compact, separator)) return `${integer}${fraction}`;
  if (fraction.length > exponent) return null;
  return `${integer}.${fraction}`;
}

function splitDecimal(value: string, separator: "." | ","): [string, string] {
  const position = value.lastIndexOf(separator);
  return [value.slice(0, position), value.slice(position + 1)];
}

function isGroupedInteger(value: string, separator: string): boolean {
  const parts = value.split(separator);
  return /^\d{1,3}$/.test(parts[0] ?? "") && parts.slice(1).every((part) => /^\d{3}$/.test(part));
}

function toCreatedExpenseDTO(transaction: LedgerTransactionRecord): CreatedExpenseDTO {
  if (transaction.kind !== "EXPENSE" || !transaction.accountId) {
    throw new Error("Ledger returned a non-expense record to the expense operation.");
  }
  return {
    id: transaction.id,
    type: "EXPENSE",
    amountMinor: transaction.amountMinor.toString(),
    currency: toCurrencyCode(transaction.currency),
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    merchantId: transaction.merchantId,
    occurredAt: transaction.occurredAt.toISOString(),
    note: transaction.note,
    status: transaction.status,
  };
}

function validationErrorCode(error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] }): CreateExpenseErrorCode {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has("amount")) return "INVALID_AMOUNT";
  if (fields.has("currency")) return "INVALID_CURRENCY";
  if (fields.has("accountId")) return "ACCOUNT_NOT_FOUND";
  if (fields.has("categoryId")) return "CATEGORY_NOT_ALLOWED";
  if (fields.has("merchant")) return "INVALID_MERCHANT";
  if (fields.has("date") || fields.has("time")) return "INVALID_OCCURRED_AT";
  if (fields.has("note")) return "INVALID_NOTE";
  return "EXPENSE_CREATE_FAILED";
}

function ledgerErrorCode(error: unknown): CreateExpenseErrorCode {
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) {
    if (error.message.startsWith("Account")) return "ACCOUNT_NOT_FOUND";
    if (error.message.startsWith("Category")) return "CATEGORY_NOT_ALLOWED";
    if (error.message.startsWith("Merchant")) return "INVALID_MERCHANT";
  }
  if (error instanceof ConflictError) {
    if (error.message.startsWith("Archived accounts")) return "ACCOUNT_UNAVAILABLE";
    if (error.message.startsWith("Transaction currency")) return "CURRENCY_MISMATCH";
  }
  return "EXPENSE_CREATE_FAILED";
}
