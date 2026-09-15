import Link from "next/link";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { OverviewInboxPreview as OverviewInboxPreviewData } from "../../domain/overview-activity.types";
import { InboxPreviewRow } from "./inbox-preview-row";

export function InboxPreview({
  inbox,
  labels,
  locale,
  timeZone,
  now,
  workspaceSlug,
}: {
  readonly inbox: OverviewInboxPreviewData;
  readonly labels: DashboardLabels;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceSlug: string;
}) {
  return (
    <section aria-labelledby="overview-inbox-heading">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[21px] font-semibold tracking-[-0.03em] text-[#101a35]" id="overview-inbox-heading">
            {labels["navigation.inbox"]}
          </h2>
          <span className="inline-flex min-w-5 items-center justify-center rounded-[6px] bg-[#eef1f5] px-1.5 py-0.5 text-[12px] font-semibold leading-4 text-[#34415a]">
            {inbox.unresolvedCount}
          </span>
        </div>
        <Link
          className="shrink-0 text-[13px] font-medium text-[#2563eb] transition-colors hover:text-[#1d4ed8] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
          href={"/w/" + workspaceSlug + "/inbox"}
        >
          {labels["overview.activity.seeAll"]}
        </Link>
      </header>
      {inbox.items.length ? (
        <div className="mt-2 divide-y divide-[#edf0f4]">
          {inbox.items.map((item) => (
            <InboxPreviewRow
              item={item}
              key={item.id}
              labels={labels}
              locale={locale}
              now={now}
              timeZone={timeZone}
              workspaceSlug={workspaceSlug}
            />
          ))}
        </div>
      ) : (
        <p className="py-5 text-[13px] text-[#71809a]">{labels["overview.activity.inbox.empty"]}</p>
      )}
    </section>
  );
}
