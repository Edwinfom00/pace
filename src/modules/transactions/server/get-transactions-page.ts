import { getLocalizedLedgerRepository } from "@/modules/ledger/server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  getTransactionsPage,
  type GetTransactionsPageInput,
} from "../queries/get-transactions-page";


export async function getServerTransactionsPage(input: GetTransactionsPageInput) {
  return getTransactionsPage(input, {
    ledger: await getLocalizedLedgerRepository(input.actor.userId),
    workspaces: new DatabaseWorkspaceRepository(),
  });
}
