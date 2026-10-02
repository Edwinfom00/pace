import Link from "next/link";
import { FiArrowRight, FiInfo } from "react-icons/fi";

import type { DashboardLabels } from "@/i18n/dashboard-messages";

import type { InsightsTrends } from "../../trends/insights-trends.types";
import { trendsSignalCopy } from "../trends-format";
import { insightsNotes } from "./insights-right-rail";

export function TrendsSignals({
  labels,
  trends,
  workspaceSlug,
}: {
  readonly labels: DashboardLabels;
  readonly trends: InsightsTrends;
  readonly workspaceSlug: string;
}) {
  const signals = trends.signals.map((signal) =>
    trendsSignalCopy(signal, trends, labels, workspaceSlug),
  );

  return (
    <section
      aria-labelledby="trends-signals-title"
      className="min-w-0 overflow-hidden rounded-[10px] border border-[#e8ecf2] bg-white">
      <div className="px-4 py-4 sm:px-5">
        <h2
          className="text-[16px] font-semibold tracking-[-0.015em] text-[#16213b]"
          id="trends-signals-title">
          {labels["insights.trends.signals.title"]}
        </h2>
        {signals.length ? (
          <ul className="mt-2 divide-y divide-[#edf0f4]">
            {signals.map((signal) => (
              <li className="py-3" key={signal.id}>
                <p className="text-[13px] leading-5 font-medium text-[#1c2740]">
                  {signal.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-[#5d6b84]">
                  {signal.body}
                </p>
                {signal.href ? (
                  <Link
                    className="mt-1 inline-flex items-center gap-1 rounded-sm text-[12px] leading-5 font-medium text-[#1769e8] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#91b5fa]"
                    href={signal.href}>
                    {labels["insights.rail.insights.view"]}
                    <FiArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pt-3 text-[13px] leading-5 text-[#71809a]">
            {labels["insights.trends.signals.empty"]}
          </p>
        )}
      </div>
      <div className="border-t border-[#edf0f4] bg-[#fbfcfe] px-4 py-4 sm:px-5">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#263149]">
          <FiInfo aria-hidden="true" className="size-4 text-[#71809a]" />
          {labels["insights.rail.notes.title"]}
        </h3>
        <ul className="mt-2.5 space-y-1.5 text-[12px] leading-5 text-[#5d6b84]">
          {insightsNotes(trends, labels).map((note) => (
            <li className="flex gap-2" key={note}>
              <span
                aria-hidden="true"
                className="mt-2 size-1 shrink-0 rounded-full bg-[#9aa6ba]"
              />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
