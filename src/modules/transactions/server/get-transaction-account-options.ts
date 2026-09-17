import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionAccountOptions,
  type GetTransactionAccountOptionsInput,
} from "../queries/get-transaction-account-options";


export function getServerTransactionAccountOptions(input: GetTransactionAccountOptionsInput) {
  return getTransactionAccountOptions(input, {
    ledger: new DatabaseLedgerRepository(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
