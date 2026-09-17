import { DatabaseLedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionDetail,
  type GetTransactionDetailInput,
} from "../queries/get-transaction-detail";

export function getServerTransactionDetail(input: GetTransactionDetailInput) {
  return getTransactionDetail(input, {
    ledger: new DatabaseLedgerRepository(),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
