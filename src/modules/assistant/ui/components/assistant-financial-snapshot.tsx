import Link from "next/link";
import {
  HiOutlineArrowRight,
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
  HiOutlineMinus,
} from "react-icons/hi2";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatAssistantDate, formatAssistantMoney } from "@/modules/pace-assistant/domain/formatters";

import {
  hasAssistantSnapshotData,
  type AssistantSnapshot,
  type AssistantSnapshotMetric,
} from "../../domain/assistant-snapshot";
import { formatAssistantMessage, type AssistantMessages } from "../assistant-messages";

export function AssistantFinancialSnapshot({
  snapshot,
  messages,
  workspaceSlug,
}: {
  readonly snapshot: AssistantSnapshot;
  readonly messages: AssistantMessages;
  readonly workspaceSlug: string;
}) {
  if (!hasAssistantSnapshotData(snapshot)) return null;

  const { currency, locale, timeZone } = snapshot;
  const money = (minorUnits: string) => formatAssistantMoney({ minorUnits, currency }, locale);
  const period = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone }).format(new Date(snapshot.periodStart));
  const plural = (base: "rail.snapshot.accounts" | "rail.snapshot.inbox", count: number) =>
    formatAssistantMessage(messages, `${base}.${count === 1 ? "one" : "other"}`, { count });

  return (
    <section aria-labelledby="assistant-snapshot-heading" className="px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-[#18233d]" id="assistant-snapshot-heading">
          {messages["rail.snapshot.title"]}
        </h2>
        <p className="text-[12px] text-[#7b859a] first-letter:uppercase">{period}</p>
      </div>
      <dl className="mt-3 divide-y divide-[#edf0f4]">
        {snapshot.balance ? (
          <SnapshotRow
            label={messages["rail.snapshot.balance"]}
            note={plural("rail.snapshot.accounts", snapshot.balance.accountCount)}
            value={money(snapshot.balance.minor)}
          />
        ) : null}
        {snapshot.spending ? (
          <SnapshotRow
            label={messages["rail.snapshot.spending"]}
            note={<Trend messages={messages} metric={snapshot.spending} />}
            value={money(snapshot.spending.minor)}
          />
        ) : null}
        {snapshot.income ? (
          <SnapshotRow
            label={messages["rail.snapshot.income"]}
            note={<Trend messages={messages} metric={snapshot.income} />}
            value={money(snapshot.income.minor)}
          />
        ) : null}
        {snapshot.inboxCount !== null ? (
          <SnapshotRow
            label={messages["rail.snapshot.inbox"]}
            value={snapshot.inboxCount === 0 ? messages["rail.snapshot.inbox.clear"] : plural("rail.snapshot.inbox", snapshot.inboxCount)}
          />
        ) : null}
      </dl>
      {snapshot.upcoming.length ? (
        <div className="mt-4">
          <h3 className="text-[12px] font-medium text-[#65718a]">{messages["rail.snapshot.upcoming"]}</h3>
          <ul className="mt-1.5 space-y-2">
            {snapshot.upcoming.map((item) => (
              <li className="flex items-baseline justify-between gap-3" key={item.recurringId}>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#22304d]">{item.name}</p>
                  <p className="text-[11px] text-[#7b859a]">{formatAssistantDate(item.nextExpectedAt, locale, timeZone)}</p>
                </div>
                <p className="shrink-0 text-[13px] font-medium text-[#22304d] tabular-nums">
                  {formatAssistantMoney({ minorUnits: item.amountMinor, currency: item.currency }, locale)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link
        className="mt-4 inline-flex items-center gap-1 rounded-[4px] text-[12px] font-semibold text-[#2457c5] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6fed]"
        href={`/w/${workspaceSlug}/overview`}
      >
        {messages["rail.snapshot.viewOverview"]}
        <HiOutlineArrowRight aria-hidden className="size-3.5" />
      </Link>
    </section>
  );
}

export function AssistantFinancialSnapshotSkeleton({ label }: { readonly label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-4 px-5 py-5" role="status">
      <Skeleton className="h-4 w-36" />
      {[0, 1, 2, 3].map((row) => (
        <div className="flex items-center justify-between gap-4" key={row}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note?: React.ReactNode;
}) {
  return (
    <div className="py-2.5 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-[13px] text-[#536079]">{label}</dt>
        <dd className="text-[13px] font-semibold text-[#17223b] tabular-nums">{value}</dd>
      </div>
      {note ? <div className="mt-0.5 flex justify-end text-[11px] text-[#7b859a]">{note}</div> : null}
    </div>
  );
}

function Trend({ metric, messages }: { readonly metric: AssistantSnapshotMetric; readonly messages: AssistantMessages }) {
  const trend = metric.trend;
  if (!trend || trend.percentage === null) return null;
  const Icon = trend.direction === "up"
    ? HiOutlineArrowTrendingUp
    : trend.direction === "down"
      ? HiOutlineArrowTrendingDown
      : HiOutlineMinus;
  const tone = trend.sentiment === "positive"
    ? "text-[#157a50]"
    : trend.sentiment === "negative"
      ? "text-[#b4472f]"
      : "text-[#7b859a]";

  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", tone)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="sr-only">
        {messages[trend.direction === "up" ? "trend.up" : trend.direction === "down" ? "trend.down" : "trend.flat"]}:
      </span>
      {formatAssistantMessage(messages, "rail.snapshot.trend", {
        percent: trend.percentage.replace(/^[+-]/, ""),
        month: trend.comparisonMonth,
      })}
    </span>
  );
}
