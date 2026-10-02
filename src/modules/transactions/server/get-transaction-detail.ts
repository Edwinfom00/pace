import { getLocalizedLedgerRepository } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionDetail,
  type GetTransactionDetailInput,
} from "../queries/get-transaction-detail";

export async function getServerTransactionDetail(input: GetTransactionDetailInput) {
  return getTransactionDetail(input, {
    ledger: await getLocalizedLedgerRepository(input.actor.userId),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
