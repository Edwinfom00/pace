import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { getLedgerService } from "./server";
import {
  createExpenseSchema,
  type CreateExpenseErrorCode,
  type CreateExpenseResult,
} from "./create-expense-contract";
import {
  createManualTransactionForActor,
  manualValidationErrorCode,
  parseManualTransactionAmount,
  resolveManualOccurredAt,
  type CreateManualTransactionDependencies,
} from "./manual-transaction";

export {
  createExpenseSchema,
  type CreateExpenseErrorCode,
  type CreatedExpenseDTO,
  type CreateExpenseResult,
} from "./create-expense-contract";
export type { CreateExpenseInput } from "./create-expense-contract";

type CreateExpenseDependencies = CreateManualTransactionDependencies;


export async function createExpense(input: unknown): Promise<CreateExpenseResult> {
  return createExpenseForActor(await getAuthenticatedActor(), input, {
    ledger: getLedgerService(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}


export async function createExpenseForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CreateExpenseDependencies,
): Promise<CreateExpenseResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: validationErrorCode(parsed.error) };
  const result = await createManualTransactionForActor(actor, {
    ...parsed.data,
    counterparty: parsed.data.merchant,
    kind: "EXPENSE",
  }, dependencies);
  if (result.ok) return { ok: true, expense: result.transaction };
  if (result.code === "INSUFFICIENT_FUNDS" && result.details) {
    return { ok: false, code: "INSUFFICIENT_FUNDS", details: result.details };
  }
  return { ok: false, code: expenseErrorCode(result.code) };
}

export const resolveOccurredAt = resolveManualOccurredAt;
export const parseExpenseAmount = parseManualTransactionAmount;

function validationErrorCode(error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] }): CreateExpenseErrorCode {
  return expenseErrorCode(manualValidationErrorCode(error, "merchant"));
}

function expenseErrorCode(code: import("./manual-transaction-contract").ManualTransactionErrorCode): CreateExpenseErrorCode {
  if (code === "INVALID_COUNTERPARTY") return "INVALID_MERCHANT";
  if (code === "TRANSACTION_CREATE_FAILED") return "EXPENSE_CREATE_FAILED";
  return code;
}
