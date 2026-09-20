import { requireAuthenticatedActor } from "@/authorization/session";

import type { LedgerAccountBalance } from "./domain";
import { getLedgerService } from "./server";

export type GetAccountBalanceInput = {
  readonly workspaceId: string;
  readonly accountId: string;
};

export type GetWorkspaceAccountBalancesInput = {
  readonly workspaceId: string;
};

/**
 * Server-only canonical account-balance read. Values remain bigint minor
 * units and are deliberately not formatted for a UI boundary.
 */
export async function getAccountBalance(
  input: GetAccountBalanceInput,
): Promise<LedgerAccountBalance> {
  return getLedgerService().getAccountBalance(await requireAuthenticatedActor(), input);
}

/** Returns one independently denominated balance per workspace account. */
export async function getWorkspaceAccountBalances(
  input: GetWorkspaceAccountBalancesInput,
): Promise<readonly LedgerAccountBalance[]> {
  return getLedgerService().getWorkspaceAccountBalances(await requireAuthenticatedActor(), input);
}
