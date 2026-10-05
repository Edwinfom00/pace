import { AuthorizationError, ConflictError, NotFoundError } from "@/authorization/errors";
import type { AuthenticatedActor } from "@/authorization/session";
import { assertWorkspacePermission } from "@/authorization/workspace-permissions";
import { toCurrencyCode } from "@/money/currency";
import { periodForLocalDates, type Period } from "@/money/period";
import { parseAmountToMinor } from "@/modules/agent-actions/transaction-draft";
import type { LedgerAccountRecord, LedgerTransactionListRow } from "@/modules/ledger/domain";
import type { LedgerService } from "@/modules/ledger/ledger-service";
import type {
  AccountDetailMovementSummaryInput,
  LedgerAccountDetailMovementSummary,
  LedgerRepository,
} from "@/modules/ledger/repositories/ledger-repository";
import { getAccountSpendability } from "@/modules/ledger/spendability-policy";
import { resolveAgentTransactionRange } from "@/modules/transactions/queries/agent-transaction-reads";
import type { WorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { accountMovementMinor } from "../domain/account-detail";
import {
  resolveAccountReference,
  type AccountReference,
  type AccountReferenceResolution,
} from "../domain/account-reference";
import type {
  AgentAccountComparisonQuery,
  AgentAccountMovementsQuery,
  AgentAccountPeriodQuery,
  AgentAccountSpendabilityQuery,
} from "../domain/agent-account-query";

export type AgentAccountReadDependencies = {
  readonly ledger: Pick<
    LedgerService,
    "listAccounts" | "getAccountBalance" | "getAccountActionPolicy" | "getOpeningBalance"
  >;
  readonly records: Pick<LedgerRepository, "listTransactionListPage"> & {
    getAccountDetailMovementSummary(
      input: AccountDetailMovementSummaryInput,
    ): Promise<LedgerAccountDetailMovementSummary>;
  };
  readonly workspaces: Pick<WorkspaceRepository, "findMemberContext">;
};

type ReadScope = { readonly actor: AuthenticatedActor; readonly workspaceId: string; readonly now?: Date };
type MovementPeriod = { readonly range: { readonly from: string; readonly to: string }; readonly instants: Period };

export async function getAgentAccount(
  input: ReadScope & { readonly reference: AccountReference },
  dependencies: AgentAccountReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const located = await locateAccount(input, input.reference, dependencies);
  if (located.status !== "RESOLVED") return unresolved(located);
  const { account } = located;

  const period = resolveMovementPeriod({}, preferences, input.now ?? new Date());
  const [balance, openingBalance, policy, summary] = await Promise.all([
    dependencies.ledger.getAccountBalance(input.actor, { workspaceId: input.workspaceId, accountId: account.id }),
    dependencies.ledger.getOpeningBalance(input.actor, { workspaceId: input.workspaceId, accountId: account.id }),
    dependencies.ledger.getAccountActionPolicy(input.actor, input.workspaceId, account.id),
    loadMovementSummary(input.workspaceId, account, period, dependencies),
  ]);
  if (balance.currency !== account.currency) {
    throw new Error("Canonical account balance currency does not match the account currency.");
  }

  return {
    resolved: true as const,
    account: presentAccount(account),
    balance: {
      current: money(balance.currentBalanceMinor, account.currency),
      available: money(balance.availableBalanceMinor, account.currency),
      spendabilityMode: balance.spendabilityMode,
    },
    openingBalance: openingBalance
      ? {
          amount: { minorUnits: openingBalance.amountMinor, currency: openingBalance.currency },
          effectiveAt: openingBalance.effectiveAt,
          hasBeenCorrected: openingBalance.hasBeenCorrected,
        }
      : null,
    allowedActions: {
      canRename: policy.canRename,
      canChangeType: policy.canChangeType,
      allowedTypeChanges: policy.allowedTypeChanges.filter((type) => type !== account.type),
      canArchive: policy.canArchive,
      canRestore: policy.canRestore,
      canDelete: policy.canDelete,
      reasons: policy.reasons,
    },
    thisMonth: presentMovementSummary(summary, account, period),
  };
}

/**
 * Explains what moved an account's balance in a period. Totals come from the
 * Account Detail ledger aggregate and rows from the canonical transaction
 * list, so a transfer counts as this account's movement while opening-balance
 * events stay out of inflows and outflows.
 */
export async function getAgentAccountMovements(
  input: ReadScope & { readonly query: AgentAccountMovementsQuery },
  dependencies: AgentAccountReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const accounts = await dependencies.ledger.listAccounts(input.actor, input.workspaceId);
  const located = requireKnownId(input.query, resolveAccountReference(input.query, accounts));
  if (located.status !== "RESOLVED") return unresolved(located);
  const { account } = located;

  const period = resolveMovementPeriod(input.query, preferences, input.now ?? new Date());
  const [balance, openingBalance, summary, rows] = await Promise.all([
    dependencies.ledger.getAccountBalance(input.actor, { workspaceId: input.workspaceId, accountId: account.id }),
    dependencies.ledger.getOpeningBalance(input.actor, { workspaceId: input.workspaceId, accountId: account.id }),
    loadMovementSummary(input.workspaceId, account, period, dependencies),
    dependencies.records.listTransactionListPage(input.workspaceId, {
      accountId: account.id,
      status: "POSTED",
      occurredFrom: period.instants.start,
      occurredToExclusive: period.instants.end,
      sort: "NEWEST",
      offset: 0,
      limit: input.query.limit,
    }),
  ]);
  const accountNames = new Map(accounts.map((candidate) => [candidate.id, candidate.name]));
  const openedAt = openingBalance ? new Date(openingBalance.effectiveAt) : null;

  return {
    resolved: true as const,
    account: presentAccount(account),
    currentBalance: money(balance.currentBalanceMinor, account.currency),
    ...presentMovementSummary(summary, account, period),
    listedCount: rows.length,
    movements: rows.map((row) => presentMovement(row, account, accountNames)),
    openingBalance: openingBalance
      ? {
          amount: { minorUnits: openingBalance.amountMinor, currency: openingBalance.currency },
          effectiveAt: openingBalance.effectiveAt,
          withinPeriod: openedAt !== null && openedAt >= period.instants.start && openedAt < period.instants.end,
          countedInInflowsOrOutflows: false as const,
        }
      : null,
  };
}

export async function compareAgentAccountMovements(
  input: ReadScope & { readonly query: AgentAccountComparisonQuery },
  dependencies: AgentAccountReadDependencies,
) {
  const preferences = await requireReader(input, dependencies);
  const accounts = (await dependencies.ledger.listAccounts(input.actor, input.workspaceId)).filter(
    (account) => input.query.includeArchived || account.archivedAt === null,
  );
  const period = resolveMovementPeriod(input.query, preferences, input.now ?? new Date());
  const summaries = await Promise.all(
    accounts.map(async (account) => ({
      account,
      summary: await loadMovementSummary(input.workspaceId, account, period, dependencies),
    })),
  );

  const currencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return {
    period: period.range,
    includesArchived: input.query.includeArchived,
    // Each currency is ranked on its own; nothing here is converted or combined across currencies.
    currencies: currencies.map((currency) => {
      const group = summaries
        .filter((entry) => entry.account.currency === currency)
        .sort(
          (left, right) =>
            compareBigints(right.summary.outflowsMinor, left.summary.outflowsMinor) ||
            left.account.name.localeCompare(right.account.name),
        );
      return {
        currency,
        highestOutflows: highest(group, (summary) => summary.outflowsMinor, currency),
        highestInflows: highest(group, (summary) => summary.inflowsMinor, currency),
        accounts: group.map(({ account, summary }) => ({
          account: presentAccount(account),
          ...presentMovementSummary(summary, account, period),
        })),
      };
    }),
  };
}

export async function checkAgentAccountSpendability(
  input: ReadScope & { readonly query: AgentAccountSpendabilityQuery },
  dependencies: AgentAccountReadDependencies,
) {
  await requireReader(input, dependencies);
  const located = await locateAccount(input, input.query, dependencies);
  if (located.status !== "RESOLVED") return unresolved(located);
  const { account } = located;

  const requestedMinor = parseAmountToMinor(input.query.amountText, account.currency);
  if (!requestedMinor) throw new ConflictError("The amount to check could not be read.");
  const balance = await dependencies.ledger.getAccountBalance(input.actor, {
    workspaceId: input.workspaceId,
    accountId: account.id,
  });
  const spendability = getAccountSpendability({
    accountId: account.id,
    accountType: account.type,
    currency: toCurrencyCode(account.currency),
    currentBalanceMinor: balance.currentBalanceMinor,
    requestedDebitMinor: BigInt(requestedMinor),
  });

  return {
    resolved: true as const,
    account: presentAccount(account),
    acceptsNewTransactions: account.archivedAt === null,
    spendabilityMode: spendability.mode,
    canDebit: spendability.canDebit,
    reason: spendability.reason,
    requested: money(spendability.requestedDebitMinor, account.currency),
    currentBalance: money(spendability.currentBalanceMinor, account.currency),
    available: money(spendability.availableBalanceMinor, account.currency),
    balanceAfter: money(spendability.projectedBalanceMinor, account.currency),
    shortfall:
      spendability.reason === "INSUFFICIENT_FUNDS"
        ? money(-spendability.projectedBalanceMinor, account.currency)
        : null,
  };
}

async function requireReader(input: ReadScope, dependencies: AgentAccountReadDependencies) {
  const member = await dependencies.workspaces.findMemberContext(input.workspaceId, input.actor.userId);
  if (!member) throw new AuthorizationError("You are not a member of this workspace.");
  assertWorkspacePermission(member.membership.role, "read");
  return member.preferences;
}

async function locateAccount(
  input: ReadScope,
  reference: AccountReference,
  dependencies: AgentAccountReadDependencies,
) {
  const accounts = await dependencies.ledger.listAccounts(input.actor, input.workspaceId);
  return requireKnownId(reference, resolveAccountReference(reference, accounts));
}

function requireKnownId(
  reference: AccountReference,
  resolution: AccountReferenceResolution<LedgerAccountRecord>,
) {
  if (reference.accountId && resolution.status !== "RESOLVED") {
    throw new NotFoundError("Account not found in this workspace.");
  }
  return resolution;
}

function unresolved(
  resolution: Exclude<AccountReferenceResolution<LedgerAccountRecord>, { readonly status: "RESOLVED" }>,
) {
  return {
    resolved: false as const,
    reason: resolution.status,
    candidates: resolution.candidates.map(presentAccount),
  };
}

function resolveMovementPeriod(
  query: AgentAccountPeriodQuery,
  preferences: { readonly timezone: string; readonly weekStartsOn: number },
  now: Date,
): MovementPeriod {
  const range = resolveAgentTransactionRange(
    query.period || query.from || query.to ? query : { period: "THIS_MONTH" },
    preferences,
    now,
  )!;
  const endExclusive = new Date(`${range.to}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return {
    range,
    instants: periodForLocalDates(range.from, endExclusive.toISOString().slice(0, 10), preferences.timezone),
  };
}

async function loadMovementSummary(
  workspaceId: string,
  account: LedgerAccountRecord,
  period: MovementPeriod,
  dependencies: AgentAccountReadDependencies,
) {
  const summary = await dependencies.records.getAccountDetailMovementSummary({
    workspaceId,
    accountId: account.id,
    periodStart: period.instants.start,
    periodEnd: period.instants.end,
  });
  if (summary.hasCurrencyMismatch) {
    throw new Error("This account contains movements in an incompatible currency.");
  }
  return summary;
}

function presentMovementSummary(
  summary: LedgerAccountDetailMovementSummary,
  account: LedgerAccountRecord,
  period: MovementPeriod,
) {
  return {
    period: period.range,
    inflows: money(summary.inflowsMinor, account.currency),
    outflows: money(summary.outflowsMinor, account.currency),
    netMovement: money(summary.inflowsMinor - summary.outflowsMinor, account.currency),
    netTransfers: money(summary.netTransfersMinor, account.currency),
    movementCount: summary.transactionCount,
  };
}

function presentMovement(
  row: LedgerTransactionListRow,
  account: LedgerAccountRecord,
  accountNames: ReadonlyMap<string, string>,
) {
  const { transaction } = row;
  const movementMinor = accountMovementMinor(transaction, account.id);
  const counterpartyId =
    transaction.kind !== "TRANSFER"
      ? null
      : transaction.accountId === account.id
        ? transaction.transferAccountId
        : transaction.accountId;
  return {
    id: transaction.id,
    kind: transaction.kind,
    occurredAt: transaction.occurredAt.toISOString(),
    direction: movementMinor < 0n ? ("OUTFLOW" as const) : ("INFLOW" as const),
    movement: money(movementMinor, transaction.currency),
    merchantName: row.merchant?.name ?? null,
    note: transaction.note,
    categoryName: row.category?.name ?? null,
    transferCounterpartyName: counterpartyId ? (accountNames.get(counterpartyId) ?? null) : null,
  };
}

function presentAccount(account: LedgerAccountRecord) {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    status: account.archivedAt ? ("ARCHIVED" as const) : ("ACTIVE" as const),
  };
}

function highest(
  group: readonly { readonly account: LedgerAccountRecord; readonly summary: LedgerAccountDetailMovementSummary }[],
  amountOf: (summary: LedgerAccountDetailMovementSummary) => bigint,
  currency: string,
) {
  const top = group.reduce((max, entry) => (amountOf(entry.summary) > max ? amountOf(entry.summary) : max), 0n);
  if (top === 0n) return null;
  return {
    amount: money(top, currency),
    accounts: group
      .filter((entry) => amountOf(entry.summary) === top)
      .map((entry) => ({ id: entry.account.id, name: entry.account.name })),
  };
}

function money(minor: bigint, currency: string) {
  return { minorUnits: minor.toString(), currency };
}

function compareBigints(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? 1 : -1;
}
