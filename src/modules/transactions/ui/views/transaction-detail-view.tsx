import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getDashboardLabels } from "@/i18n/dashboard-messages";

import type { TransactionDetailData } from "../../domain/transaction-detail";
import type { TransactionAccountOptionsState } from "../../domain/transaction-account-options";
import type { TransactionCategoryOption } from "../../domain/transaction-category-options";
import { getTransactionDetailActionLabels } from "../transaction-detail-action-labels";
import { getTransactionDetailLabels } from "../transaction-detail-labels";
import { getTransactionEditLabels } from "../transaction-edit-labels";
import { TransactionDetailActions } from "../components/transaction-detail-actions";
import { TransactionDetailActivity } from "../components/transaction-detail-activity";
import { TransactionDetailAskPace } from "../components/transaction-detail-ask-pace";
import { TransactionDetailCard } from "../components/transaction-detail-card";
import { TransactionCorrectionSummary } from "../components/transaction-correction-summary";
import { TransactionCorrectionTechnicalEntry } from "../components/transaction-correction-technical-entry";
import { TransactionFinancialContext } from "../components/transaction-financial-context";
import { TransactionDetailHero } from "../components/transaction-detail-hero";
import { TransactionSourceInformation } from "../components/transaction-source-information";
import { TransactionTechnicalDetails } from "../components/transaction-technical-details";

export function TransactionDetailView({
  accountOptions = { status: "ready", accounts: [] },
  categories,
  transaction,
  workspaceSlug,
  workspaceId,
  language,
  locale,
  timeZone,
}: {
  readonly accountOptions?: TransactionAccountOptionsState;
  readonly categories: readonly TransactionCategoryOption[];
  readonly transaction: TransactionDetailData;
  readonly workspaceSlug: string;
  readonly workspaceId: string;
  readonly language: "en" | "fr" | "de";
  readonly locale: string;
  readonly timeZone: string;
}) {
  const dashboardLabels = getDashboardLabels(language);
  const actionLabels = getTransactionDetailActionLabels(dashboardLabels);
  const editLabels = getTransactionEditLabels(dashboardLabels);
  const labels = getTransactionDetailLabels(dashboardLabels);
  const askPaceCategory = transaction.category ? labels.systemCategory(transaction.category) : null;

  if (transaction.correction?.state === "TECHNICAL") {
    return <TransactionCorrectionTechnicalEntry labels={labels} transaction={transaction} workspaceSlug={workspaceSlug} />;
  }

  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#637491] transition-colors hover:text-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]" href={`/w/${workspaceSlug}/transactions`}><ArrowLeft aria-hidden className="size-4" />{labels.back}</Link>
      <div className="mt-6"><TransactionDetailHero labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} /></div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,320px)] xl:gap-7">
        <div className="min-w-0 space-y-4">
          <TransactionDetailCard labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} />
          <TransactionCorrectionSummary labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} workspaceSlug={workspaceSlug} />
          <TransactionFinancialContext labels={labels} locale={locale} transaction={transaction} />
          <TransactionSourceInformation labels={labels} transaction={transaction} />
          {transaction.capabilities.canViewTechnicalDetails ? <TransactionTechnicalDetails labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} /> : null}
        </div>
        <aside aria-label={labels.sideRail} className="space-y-4 xl:sticky xl:top-6">
          <TransactionDetailActions
            accountOptions={accountOptions}
            categories={categories}
            editLabels={editLabels}
            labels={actionLabels}
            language={language}
            locale={locale}
            timeZone={timeZone}
            transaction={transaction}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
          />
          <TransactionDetailActivity labels={labels} locale={locale} timeZone={timeZone} transaction={transaction} />
          <TransactionDetailAskPace categoryLabel={askPaceCategory} labels={labels.askPace} language={language} locale={locale} timeZone={timeZone} transaction={transaction} workspaceId={workspaceId} />
        </aside>
      </div>
    </main>
  );
}
