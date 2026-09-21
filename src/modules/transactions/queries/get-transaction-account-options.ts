import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { toCurrencyCode } from "@/money/currency";
import type { LedgerAccountBalance, LedgerAccountRecord } from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { TransactionAccountOption } from "../domain/transaction-account-options";

type TransactionAccountsLedgerRepository = Pick<LedgerRepository, "getWorkspaceAccountBalances" | "listAccounts">;
type TransactionAccountsWorkspaceRepository = Pick<WorkspaceRepository, "findMembership">;

export type GetTransactionAccountOptionsInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
};


export async function getTransactionAccountOptions(
  input: GetTransactionAccountOptionsInput,
  dependencies: {
    readonly ledger: TransactionAccountsLedgerRepository;
    readonly workspaces: TransactionAccountsWorkspaceRepository;
  },
): Promise<readonly TransactionAccountOption[]> {
  const membership = await dependencies.workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const [accounts, balances] = await Promise.all([
    dependencies.ledger.listAccounts(input.workspaceId),
    dependencies.ledger.getWorkspaceAccountBalances(input.workspaceId),
  ]);
  const balanceByAccountId = new Map(balances.map((balance) => [balance.accountId, balance]));
  return accounts
    .map((account) => mapTransactionAccountOption(account, balanceByAccountId.get(account.id)))
    .filter((account): account is TransactionAccountOption => account !== null)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function mapTransactionAccountOption(
  account: LedgerAccountRecord,
  balance?: LedgerAccountBalance,
): TransactionAccountOption | null {
  if (account.archivedAt !== null) return null;

  // A selector must never silently invent a zero or an unlimited balance. A
  // missing canonical read makes the whole query fail safely instead.
  if (!balance || balance.currency !== toCurrencyCode(account.currency)) {
    throw new Error("Canonical balance data was unavailable for an active account.");
  }

  return {
    id: account.id,
    name: account.name,
    currency: toCurrencyCode(account.currency),
    type: account.type,
    currentBalanceMinor: balance.currentBalanceMinor.toString(),
    availableBalanceMinor: balance.availableBalanceMinor.toString(),
    spendabilityMode: balance.spendabilityMode,
  };
}
