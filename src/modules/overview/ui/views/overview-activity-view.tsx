import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type {
  OverviewInboxPreview,
  OverviewRecentTransaction,
} from "../../domain/overview-activity.types";
import { InboxPreview } from "../components/inbox-preview";
import { RecentTransactionsPreview } from "../components/recent-transactions-preview";

export function OverviewActivityView({
  recentTransactions,
  inbox,
  labels,
  locale,
  timeZone,
  now,
  workspaceSlug,
}: {
  readonly recentTransactions: readonly OverviewRecentTransaction[];
  readonly inbox: OverviewInboxPreview;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceSlug: string;
}) {
  return (
    <div className="space-y-6 pt-1 sm:space-y-7">
      <RecentTransactionsPreview
        labels={labels}
        locale={locale}
        now={now}
        timeZone={timeZone}
        transactions={recentTransactions}
        workspaceSlug={workspaceSlug}
      />
      <InboxPreview
        inbox={inbox}
        labels={labels}
        locale={locale}
        now={now}
        timeZone={timeZone}
        workspaceSlug={workspaceSlug}
      />
    </div>
  );
}
