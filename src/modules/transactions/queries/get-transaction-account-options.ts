import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { LedgerAccountRecord } from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { TransactionAccountOption } from "../domain/transaction-account-options";

type TransactionAccountsLedgerRepository = Pick<LedgerRepository, "listAccounts">;
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

  const accounts = await dependencies.ledger.listAccounts(input.workspaceId);
  return accounts
    .map(mapTransactionAccountOption)
    .filter((account): account is TransactionAccountOption => account !== null)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

/** Archived ledger accounts remain visible in historical reporting but cannot receive new entries. */
export function mapTransactionAccountOption(
  account: LedgerAccountRecord,
): TransactionAccountOption | null {
  if (account.archivedAt !== null) return null;

  return { id: account.id, name: account.name, currency: account.currency };
}
