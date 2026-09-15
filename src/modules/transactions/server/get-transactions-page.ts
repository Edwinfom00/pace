import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionsPage,
  type GetTransactionsPageInput,
} from "../queries/get-transactions-page";


export function getServerTransactionsPage(input: GetTransactionsPageInput) {
  return getTransactionsPage(input, {
    ledger: new DatabaseLedgerRepository(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
