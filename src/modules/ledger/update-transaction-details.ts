import { z } from "zod";

import {
  AuthorizationError,
  DomainConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { getAuthenticatedActor, type AuthenticatedActor } from "@/authorization/session";
import { getTransactionDetail } from "@/modules/transactions/queries/get-transaction-detail";
import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { LedgerService } from "./ledger-service";
import { DatabaseLedgerRepository, type LedgerRepository } from "./repositories/ledger-repository";
import {
  transactionUpdateValidationErrorCode,
  updateTransactionDetailsSchema,
  type TransactionUpdateErrorCode,
  type UpdateTransactionDetailsInput,
} from "./update-transaction-details-contract";

export {
  updateTransactionDetailsSchema,
  type TransactionUpdateErrorCode,
  type UpdateTransactionDetailsInput,
} from "./update-transaction-details-contract";

export type UpdatedTransactionDetailsDTO = TransactionDetailData;
export type UpdateTransactionDetailsResult =
  | { readonly ok: true; readonly transaction: UpdatedTransactionDetailsDTO }
  | { readonly ok: false; readonly code: TransactionUpdateErrorCode };

type UpdateTransactionDetailsDependencies = {
  readonly ledger: Pick<LedgerService, "updateTransactionDetails">;
  readonly ledgerRecords: LedgerRepository;
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext" | "findMembership">;
};


export async function updateTransactionDetails(
  input: UpdateTransactionDetailsInput,
): Promise<UpdateTransactionDetailsResult> {
  const records = new DatabaseLedgerRepository();
  const workspaces = new DatabaseWorkspaceRepository();
  return updateTransactionDetailsForActor(await getAuthenticatedActor(), input, {
    ledger: new LedgerService(records, workspaces),
    ledgerRecords: records,
    workspaces,
  });
}

/** Injectable entry point for server/domain tests; actor must be session-resolved. */
export async function updateTransactionDetailsForActor(
  actor: AuthenticatedActor | null,
  input: unknown,
  dependencies: UpdateTransactionDetailsDependencies,
): Promise<UpdateTransactionDetailsResult> {
  if (!actor) return { ok: false, code: "UNAUTHENTICATED" };

  const parsed = updateTransactionDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: transactionUpdateValidationErrorCode(parsed.error) };

  const workspace = await dependencies.workspaces.findMemberContext(parsed.data.workspaceId, actor.userId);
  if (!workspace) return { ok: false, code: "WORKSPACE_FORBIDDEN" };

  try {
    await dependencies.ledger.updateTransactionDetails(
      actor,
      parsed.data.workspaceId,
      parsed.data.transactionId,
      parsed.data.patch,
      parsed.data.expectedUpdatedAt,
      workspace.preferences.timezone,
    );
    const detail = await getTransactionDetail({
      actor,
      workspaceId: parsed.data.workspaceId,
      transactionId: parsed.data.transactionId,
      timeZone: workspace.preferences.timezone,
    }, {
      ledger: dependencies.ledgerRecords,
      workspaces: dependencies.workspaces,
    });
    if (!detail) return { ok: false, code: "TRANSACTION_UPDATE_FAILED" };
    return { ok: true, transaction: detail };
  } catch (error) {
    return { ok: false, code: transactionUpdateErrorCode(error) };
  }
}

function transactionUpdateErrorCode(error: unknown): TransactionUpdateErrorCode {
  if (error instanceof z.ZodError) return transactionUpdateValidationErrorCode(error);
  if (error instanceof AuthorizationError) return "WORKSPACE_FORBIDDEN";
  if (error instanceof NotFoundError) return "TRANSACTION_NOT_FOUND";
  if (error instanceof DomainConflictError) {
    if (
      error.code === "TRANSACTION_EDIT_NOT_ALLOWED"
      || error.code === "CATEGORY_NOT_ALLOWED"
      || error.code === "INVALID_OCCURRED_AT"
      || error.code === "CONCURRENT_MODIFICATION"
    ) {
      return error.code;
    }
  }
  return "TRANSACTION_UPDATE_FAILED";
}
