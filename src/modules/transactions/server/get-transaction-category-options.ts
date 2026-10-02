import { getLocalizedLedgerRepository } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionCategoryOptions,
  type GetTransactionCategoryOptionsInput,
} from "../queries/get-transaction-category-options";

/** Server-only composition root. The transaction client receives only category DTOs. */
export async function getServerTransactionCategoryOptions(input: GetTransactionCategoryOptionsInput) {
  return getTransactionCategoryOptions(input, {
    ledger: await getLocalizedLedgerRepository(input.actor.userId),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
