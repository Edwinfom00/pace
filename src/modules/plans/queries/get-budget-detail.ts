import "server-only";

import type { AuthenticatedActor } from "@/authorization/session";
import { getLedgerService } from "@/modules/ledger/server";
import { getTransactionsPage } from "@/modules/transactions/queries/get-transactions-page";
import type { TransactionFilterState } from "@/modules/transactions/types/transaction-ui.types";

import { getPlansService } from "../server";

export async function getBudgetDetail({
  actor,
  workspaceId,
  budgetId,
  timeZone,
  now,
  unknownMerchantName,
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly budgetId: string;
  readonly timeZone: string;
  readonly now: Date;
  readonly unknownMerchantName: string;
}) {
  const plans = getPlansService();
  const summary = await plans.getBudgetSummary(
    actor,
    workspaceId,
    budgetId,
    now,
  );
  if (!summary) return null;
  const ledger = getLedgerService();
  const categories = await ledger.listCategories(actor, workspaceId);
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const filters: TransactionFilterState & { page: number; pageSize: number } = {
    kind: "ALL",
    search: "",
    sort: "NEWEST",
    page: 1,
    pageSize: 8,
    ...(summary.budget.scope === "CATEGORY"
      ? { categoryId: summary.budget.categoryId ?? undefined }
      : {}),
    from: date(summary.periodStart),
    to: date(new Date(summary.periodEnd.getTime() - 1)),
  };
  const transactions = await getTransactionsPage(
    {
      actor,
      workspaceId,
      filters,
      timeZone,
      unknownMerchantName,
    },
    {
      ledger: new (
        await import("@/modules/ledger/repositories/ledger-repository")
      ).DatabaseLedgerRepository(),
      workspaces: new (
        await import("@/modules/workspaces/repositories/workspace-repository")
      ).DatabaseWorkspaceRepository(),
    },
  );
  return {
    summary,
    category:
      categories.find((item) => item.id === summary.budget.categoryId) ?? null,
    transactions,
  };
}
