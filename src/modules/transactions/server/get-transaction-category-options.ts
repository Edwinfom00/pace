import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionCategoryOptions,
  type GetTransactionCategoryOptionsInput,
} from "../queries/get-transaction-category-options";

/** Server-only composition root. The transaction client receives only category DTOs. */
export function getServerTransactionCategoryOptions(input: GetTransactionCategoryOptionsInput) {
  return getTransactionCategoryOptions(input, {
    ledger: new DatabaseLedgerRepository(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
