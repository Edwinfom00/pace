import "server-only";

import type { AuthenticatedActor } from "@/authorization/session";
import { getLedgerService } from "@/modules/ledger/server";

import {
  buildAccountsOverview,
  type AccountListFilter,
  type AccountsOverview,
} from "../domain/accounts-overview";


export async function getAccountsOverview({
  actor,
  workspaceId,
  filter,
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly filter: AccountListFilter;
}): Promise<AccountsOverview> {
  const ledger = getLedgerService();
  const [accounts, balances] = await Promise.all([
    ledger.listAccounts(actor, workspaceId),
    ledger.getWorkspaceAccountBalances(actor, { workspaceId }),
  ]);

  return buildAccountsOverview({ accounts, balances, filter });
}
