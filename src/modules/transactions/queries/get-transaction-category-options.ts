import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import type { LedgerCategoryRecord } from "@/modules/ledger/domain";
import type { LedgerRepository } from "@/modules/ledger/repositories/ledger-repository";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import type { TransactionCategoryOption } from "../domain/transaction-category-options";

type TransactionCategoriesLedgerRepository = Pick<LedgerRepository, "listCategories">;
type TransactionCategoriesWorkspaceRepository = Pick<WorkspaceRepository, "findMembership">;

export type GetTransactionCategoryOptionsInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
};

export async function getTransactionCategoryOptions(
  input: GetTransactionCategoryOptionsInput,
  dependencies: {
    readonly ledger: TransactionCategoriesLedgerRepository;
    readonly workspaces: TransactionCategoriesWorkspaceRepository;
  },
): Promise<readonly TransactionCategoryOption[]> {
  const membership = await dependencies.workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const categories = await dependencies.ledger.listCategories(input.workspaceId);
  return categories
    .map(mapTransactionCategoryOption)
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}


export function mapTransactionCategoryOption(category: LedgerCategoryRecord): TransactionCategoryOption {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    systemKey: category.systemKey,
  };
}
