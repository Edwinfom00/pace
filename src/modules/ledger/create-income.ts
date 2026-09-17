import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  createIncomeSchema,
  type CreateIncomeErrorCode,
  type CreateIncomeResult,
} from "./create-income-contract";
import {
  createManualTransactionForActor,
  manualValidationErrorCode,
  parseManualTransactionAmount,
  resolveManualOccurredAt,
  type CreateManualTransactionDependencies,
} from "./manual-transaction";
import { getLedgerService } from "./server";

export {
  createIncomeSchema,
  type CreateIncomeErrorCode,
  type CreatedIncomeDTO,
  type CreateIncomeResult,
} from "./create-income-contract";
export type { CreateIncomeInput } from "./create-income-contract";

type CreateIncomeDependencies = CreateManualTransactionDependencies;

/** Canonical server operation for a user-confirmed, explicit manual Income. */
export async function createIncome(input: unknown): Promise<CreateIncomeResult> {
  return createIncomeForActor(await getAuthenticatedActor(), input, {
    ledger: getLedgerService(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}

/** Injectable variant for server-level tests; actor input must be session-resolved. */
export async function createIncomeForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: CreateIncomeDependencies,
): Promise<CreateIncomeResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = createIncomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: incomeValidationErrorCode(parsed.error) };

  const result = await createManualTransactionForActor(actor, {
    ...parsed.data,
    counterparty: parsed.data.source,
    kind: "INCOME",
  }, dependencies);
  if (result.ok) return { ok: true, income: result.transaction };
  return { ok: false, code: incomeErrorCode(result.code) };
}


export const parseIncomeAmount = parseManualTransactionAmount;
export const resolveIncomeOccurredAt = resolveManualOccurredAt;

function incomeValidationErrorCode(
  error: { readonly issues: readonly { readonly path: readonly PropertyKey[] }[] },
): CreateIncomeErrorCode {
  return incomeErrorCode(manualValidationErrorCode(error, "source"));
}

function incomeErrorCode(
  code: import("./manual-transaction-contract").ManualTransactionErrorCode,
): CreateIncomeErrorCode {
  if (code === "INVALID_COUNTERPARTY") return "INVALID_SOURCE";
  return code;
}
