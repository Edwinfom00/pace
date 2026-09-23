import { AuthorizationError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { getInboxResolutionCapabilities } from "@/modules/financial-inbox/inbox-resolution-policy";
import { mapTransactionListItem } from "@/modules/transactions/queries/get-transactions-page";
import type { WorkspaceMembershipRecord } from "@/modules/workspaces/domain";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import {
  INBOX_REASONS,
  type InboxReason,
} from "../domain";
import {
  INBOX_OVERVIEW_PAGE_SIZE,
  type InboxOverview,
  type InboxOverviewFilter,
  type InboxOverviewItem,
  type InboxOverviewReader,
  type InboxOverviewSort,
} from "../inbox-overview";

type InboxOverviewWorkspaceRepository = Pick<WorkspaceRepository, "findMembership">;

export type GetInboxOverviewInput = {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly reason: InboxOverviewFilter;
  readonly sort?: InboxOverviewSort;
  readonly page: number;
  readonly pageSize?: number;
  readonly unknownMerchantName: string;
};

export async function getInboxOverview(
  input: GetInboxOverviewInput,
  dependencies: {
    readonly reader: InboxOverviewReader;
    readonly workspaces: InboxOverviewWorkspaceRepository;
  },
): Promise<InboxOverview> {
  const membership = await dependencies.workspaces.findMembership(input.workspaceId, input.actor.userId);
  if (!membership) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(membership.role, "read");

  const pageSize = normalizePageSize(input.pageSize);
  const sort = input.sort ?? "NEWEST";
  const requestedPage = Math.max(1, Math.floor(input.page));
  let result = await dependencies.reader.readInboxOverview({
    workspaceId: input.workspaceId,
    reason: input.reason,
    sort,
    offset: (requestedPage - 1) * pageSize,
    limit: pageSize,
  });
  const totalPages = Math.max(1, Math.ceil(result.filteredCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  // A stale shared URL should show the final valid page, never masquerade as
  // a filtered empty state while unresolved records still exist.
  if (page !== requestedPage) {
    result = await dependencies.reader.readInboxOverview({
      workspaceId: input.workspaceId,
      reason: input.reason,
      sort,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
  }

  return {
    unresolvedCount: result.unresolvedCount,
    availableFilters: INBOX_REASONS.flatMap((reason) => {
      const count = result.reasonCounts.find((entry) => entry.reason === reason)?.count ?? 0;
      return count > 0 ? [{ reason, count }] : [];
    }),
    activeFilter: input.reason,
    sort,
    items: result.rows.map((row) => toInboxOverviewItem(row, input.unknownMerchantName, "OPEN", membership.role)),
    recentlyResolved: result.recentlyResolvedRows.map((row) => toInboxOverviewItem(row, input.unknownMerchantName, "RESOLVED", membership.role)),
    pagination: {
      page,
      pageSize,
      totalCount: result.filteredCount,
    },
  };
}

function toInboxOverviewItem(
  row: Awaited<ReturnType<InboxOverviewReader["readInboxOverview"]>>["rows"][number],
  unknownMerchantName: string,
  status: InboxOverviewItem["status"],
  workspaceRole: WorkspaceMembershipRecord["role"],
): InboxOverviewItem {
  const classification = row.classification;
  const proposal = classification?.status === "NEEDS_REVIEW" && row.suggestedCategory
    ? {
        id: row.suggestedCategory.id,
        label: row.suggestedCategory.name,
        key: row.suggestedCategory.systemKey ?? row.suggestedCategory.id,
      }
    : null;

  return {
    id: row.item.id,
    reason: row.item.reason,
    status,
    capabilities: getInboxResolutionCapabilities({
      item: row.item,
      sourceTransaction: row.transaction.transaction,
      effectiveTransaction: row.transaction.transaction,
      classification: row.classification,
      suggestedCategory: row.suggestedCategory,
      recurring: row.recurring,
      workspaceRole,
    }),
    createdAt: row.item.createdAt.toISOString(),
    updatedAt: row.item.updatedAt.toISOString(),
    transactionUpdatedAt: row.transaction.transaction.updatedAt.toISOString(),
    transaction: mapTransactionListItem(row.transaction, unknownMerchantName),
    classification: classification
      ? {
          id: classification.id,
          source: classification.source,
          status: classification.status,
          confidence: classification.confidence,
          updatedAt: classification.updatedAt.toISOString(),
          proposal,
        }
      : null,
    recurring: row.recurring,
    provenance: transactionProvenance(row.transaction.transaction.source),
  };
}

function normalizePageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return INBOX_OVERVIEW_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value ?? INBOX_OVERVIEW_PAGE_SIZE), 1), INBOX_OVERVIEW_PAGE_SIZE);
}

function transactionProvenance(source: Record<string, unknown>): "IMPORT" | "MANUAL" | null {
  const provider = source.provider;
  if (provider === "import") return "IMPORT";
  if (provider === "manual") return "MANUAL";
  return null;
}

export function isInboxReason(value: string | undefined): value is InboxReason {
  return INBOX_REASONS.includes(value as InboxReason);
}
