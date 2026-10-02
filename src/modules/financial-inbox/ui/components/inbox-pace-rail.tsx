"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { FiMoreHorizontal, FiSend } from "react-icons/fi";
import {
  HiOutlineArrowPath,
  HiOutlineArrowsPointingIn,
  HiOutlineArrowsRightLeft,
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineDocumentText,
  HiOutlineFunnel,
  HiOutlineMagnifyingGlass,
  HiOutlinePlay,
  HiOutlineSparkles,
  HiOutlineTag,
} from "react-icons/hi2";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import type { DashboardLabels } from "@/i18n/dashboard-messages";
import { cn } from "@/lib/utils";
import { formatOverviewRightRailDate } from "@/modules/overview/domain/overview-right-rail-formatters";
import { getPaceAssistantLabels } from "@/modules/pace-assistant/ui/assistant-labels";
import { PaceAssistantLauncher } from "@/modules/pace-assistant/ui/views/pace-assistant-launcher";

import type { InboxReason } from "../../domain";
import type { InboxOverview, InboxOverviewFilter, InboxReasonSummary } from "../../inbox-overview";
import { inboxReasonCountText } from "../inbox-reason-labels";

const REASON_TONE: Record<InboxReason, string> = {
  UNKNOWN_CATEGORY: "bg-[#f1f3f7] text-[#53627b]",
  POSSIBLE_TRANSFER: "bg-[#f3f0ff] text-[#7658d9]",
  POSSIBLE_RECURRING: "bg-[#fff1ea] text-[#e0612b]",
  MERCHANT_AMBIGUITY: "bg-[#eef4ff] text-[#2563eb]",
  CLASSIFICATION_REVIEW: "bg-[#f1f3f7] text-[#53627b]",
};

export function InboxPaceRail({
  overview,
  labels,
  language,
  locale,
  timeZone,
  now,
  workspaceId,
  reviewAllHref,
  onFilter,
  onShowHighImpact,
}: {
  readonly overview: InboxOverview;
  readonly labels: DashboardLabels;
  readonly language: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly now: string;
  readonly workspaceId: string;
  readonly reviewAllHref: string | null;
  readonly onFilter: (reason: InboxOverviewFilter) => void;
  readonly onShowHighImpact: () => void;
}) {
  const assistantLabels = getPaceAssistantLabels(language);
  const [prompt, setPrompt] = useState("");
  const count = overview.unresolvedCount;
  const headline = count === 0
    ? labels["inbox.ai.headline.empty"]
    : count === 1
      ? labels["inbox.ai.headline.one"]
      : labels["inbox.ai.headline.other"].replace("{count}", String(count));
  const suggestions = [
    labels["inbox.ai.suggestion.why"],
    labels["inbox.ai.suggestion.duplicates"],
    labels["inbox.ai.suggestion.recurring"],
  ];

  return (
    <PaceAssistantLauncher
      language={language}
      locale={locale}
      pageContext={{ page: "inbox" }}
      timeZone={timeZone}
      workspaceId={workspaceId}
    >
      {({ openPaceAssistant }) => {
        const send = () => {
          const next = prompt.trim();
          if (!next) return;
          setPrompt("");
          openPaceAssistant(next);
        };

        return (
          <aside aria-label={labels["inbox.ai.label"]} className="flex flex-col">
            <header className="flex items-center gap-2.5">
              <PaceLogo alt="" height={28} variant="icon" width={28} />
              <span className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]">Pace</span>
              <span className="rounded-[6px] bg-[#eef4ff] px-1.5 py-0.5 text-[12px] font-semibold text-[#2f6fed]">AI</span>
              <button
                aria-label={labels["inbox.ai.open"]}
                className="ml-auto grid size-8 place-items-center rounded-[7px] text-[#53627b] transition-colors hover:bg-[#f3f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                onClick={() => openPaceAssistant()}
                type="button"
              >
                <FiMoreHorizontal aria-hidden className="size-4" />
              </button>
            </header>

            <section aria-labelledby="inbox-ai-summary-heading" className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight text-[#101a35]" id="inbox-ai-summary-heading">
                  {labels["inbox.ai.summary.title"]}
                </h2>
                <p className="shrink-0 text-[13px] text-[#71809a]">{formatOverviewRightRailDate(now, locale, timeZone)}</p>
              </div>

              <div className="mt-5 flex gap-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#eaf8f0] text-[#16a06a]">
                  {count === 0
                    ? <HiOutlineCheckCircle aria-hidden className="size-5" />
                    : <HiOutlineArrowsPointingIn aria-hidden className="size-5" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[16px] font-medium leading-6 tracking-[-0.015em] text-[#14203b]">{headline}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-[#71809a]">
                    {count === 0 ? labels["inbox.ai.empty"] : labels["inbox.ai.found"]}
                  </p>
                </div>
              </div>

              {overview.reasonSummaries.length ? (
                <ul className="mt-4 space-y-1">
                  {overview.reasonSummaries.map((summary) => (
                    <li key={summary.reason}>
                      <ReasonSummaryRow
                        active={overview.activeFilter === summary.reason}
                        labels={labels}
                        onSelect={() => onFilter(overview.activeFilter === summary.reason ? null : summary.reason)}
                        summary={summary}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section aria-labelledby="inbox-ai-actions-heading" className="mt-6 border-t border-[#edf0f4] pt-6">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]" id="inbox-ai-actions-heading">
                {labels["inbox.ai.actions.title"]}
              </h2>
              <div className="mt-3.5 space-y-2.5">
                {reviewAllHref ? (
                  <Link className={actionCardClassName(false)} href={reviewAllHref}>
                    <SuggestedActionContent
                      description={labels["inbox.ai.actions.reviewAll.description"].replace("{count}", String(count))}
                      icon={<HiOutlinePlay aria-hidden className="size-5" />}
                      title={labels["inbox.ai.actions.reviewAll"]}
                    />
                  </Link>
                ) : null}
                <button
                  aria-pressed={overview.sort === "LARGEST"}
                  className={actionCardClassName(overview.sort === "LARGEST")}
                  onClick={onShowHighImpact}
                  type="button"
                >
                  <SuggestedActionContent
                    description={labels["inbox.ai.actions.highImpact.description"]}
                    icon={<HiOutlineFunnel aria-hidden className="size-5" />}
                    title={labels["inbox.ai.actions.highImpact"]}
                  />
                </button>
                <button
                  className={actionCardClassName(false)}
                  onClick={() => openPaceAssistant(labels["inbox.ai.actions.ignore.prompt"])}
                  type="button"
                >
                  <SuggestedActionContent
                    description={labels["inbox.ai.actions.ignore.description"]}
                    icon={<HiOutlineSparkles aria-hidden className="size-5" />}
                    title={labels["inbox.ai.actions.ignore"]}
                  />
                </button>
              </div>
            </section>

            <section aria-labelledby="inbox-ask-pace-heading" className="mt-7">
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#101a35]" id="inbox-ask-pace-heading">
                {assistantLabels.ask}
              </h2>
              <form className="mt-3" onSubmit={(event) => { event.preventDefault(); send(); }}>
                <div className="flex h-12 items-stretch overflow-hidden rounded-[10px] border border-[#dfe4ec] bg-white focus-within:border-[#8db2ff] focus-within:ring-3 focus-within:ring-[#dce8ff]">
                  <label className="sr-only" htmlFor="inbox-ask-pace-input">{assistantLabels.placeholder}</label>
                  <input
                    className="min-w-0 flex-1 bg-transparent px-3.5 text-[13px] text-[#263149] outline-none placeholder:text-[#8090a8]"
                    id="inbox-ask-pace-input"
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={assistantLabels.placeholder}
                    value={prompt}
                  />
                  <button
                    aria-label={assistantLabels.send}
                    className="grid w-12 shrink-0 place-items-center border-l border-[#e5e9f0] bg-[#f5f7fa] text-[#40506c] transition-colors hover:bg-[#edf3ff] hover:text-[#2563eb] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2563eb] disabled:cursor-not-allowed disabled:text-[#b5bfce]"
                    disabled={!prompt.trim()}
                    type="submit"
                  >
                    <FiSend aria-hidden className="size-4" />
                  </button>
                </div>
              </form>
              <div aria-label={assistantLabels.suggestedQuestions} className="mt-3 flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    className="rounded-full border border-[#e2e7ef] bg-white px-3 py-1.5 text-[12px] text-[#40506c] transition-colors hover:border-[#b9cffd] hover:bg-[#f6f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                    key={suggestion}
                    onClick={() => openPaceAssistant(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
                <button
                  aria-label={labels["inbox.ai.open"]}
                  className="grid h-7.5 w-10 place-items-center rounded-full border border-[#e2e7ef] bg-white text-[#40506c] transition-colors hover:border-[#b9cffd] hover:bg-[#f6f9ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                  onClick={() => openPaceAssistant()}
                  type="button"
                >
                  <FiMoreHorizontal aria-hidden className="size-4" />
                </button>
              </div>
            </section>
          </aside>
        );
      }}
    </PaceAssistantLauncher>
  );
}

function ReasonSummaryRow({
  summary,
  labels,
  active,
  onSelect,
}: {
  readonly summary: InboxReasonSummary;
  readonly labels: DashboardLabels;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const title = inboxReasonCountText(labels, summary.reason, summary.count);

  return (
    <button
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-[10px] px-1 py-2.5 text-left transition-colors hover:bg-[#f7f9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
        active && "bg-[#f3f7ff] hover:bg-[#edf3ff]",
      )}
      onClick={onSelect}
      type="button"
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", REASON_TONE[summary.reason])}>
        {reasonIcon(summary.reason)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-5 text-[#14203b]">{title}</span>
        {summary.merchants.length ? (
          <span className="mt-0.5 block truncate text-[13px] leading-5 text-[#71809a]">{summary.merchants.join(", ")}</span>
        ) : null}
      </span>
      <HiOutlineChevronRight aria-hidden className="size-4 shrink-0 text-[#53627b]" />
    </button>
  );
}

function SuggestedActionContent({
  icon,
  title,
  description,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[#f2f6ff] text-[#2563eb]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium leading-5 text-[#14203b]">{title}</span>
        <span className="mt-0.5 block truncate text-[12px] leading-4 text-[#71809a]">{description}</span>
      </span>
    </>
  );
}

function actionCardClassName(active: boolean) {
  return cn(
    "flex w-full items-center gap-3.5 rounded-[10px] border bg-white px-3.5 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]",
    active ? "border-[#b9cffd] bg-[#f6f9ff]" : "border-[#e5e9f0] hover:border-[#cfdbec] hover:bg-[#fafbfd]",
  );
}

function reasonIcon(reason: InboxReason) {
  const className = "size-5";
  switch (reason) {
    case "MERCHANT_AMBIGUITY":
      return <HiOutlineMagnifyingGlass aria-hidden className={className} />;
    case "POSSIBLE_RECURRING":
      return <HiOutlineArrowPath aria-hidden className={className} />;
    case "POSSIBLE_TRANSFER":
      return <HiOutlineArrowsRightLeft aria-hidden className={className} />;
    case "CLASSIFICATION_REVIEW":
      return <HiOutlineDocumentText aria-hidden className={className} />;
    case "UNKNOWN_CATEGORY":
      return <HiOutlineTag aria-hidden className={className} />;
  }
}
