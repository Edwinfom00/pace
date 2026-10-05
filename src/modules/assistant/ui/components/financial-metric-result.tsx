import {
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
  HiOutlineMinus,
} from "react-icons/hi2";

import { cn } from "@/lib/utils";
import { formatAssistantMoney } from "@/modules/pace-assistant/domain/formatters";
import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";

import type { AssistantMessages } from "../assistant-messages";

type MetricBlock = Extract<PaceAssistantBlock, { type: "metric" }>;
type MetricGridBlock = Extract<PaceAssistantBlock, { type: "metric-grid" }>;
type MetricItem = MetricGridBlock["items"][number];

const GRID_COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

export function FinancialMetricResult({
  block,
  locale,
  messages,
}: {
  readonly block: MetricBlock | MetricGridBlock;
  readonly locale: string;
  readonly messages: AssistantMessages;
}) {
  if (block.type === "metric") {
    return (
      <section className="rounded-[12px] border border-[#e5e9f0] bg-white px-4 py-4">
        <Metric emphasis item={block} locale={locale} messages={messages} />
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-[#e5e9f0] bg-white">
      {block.title ? (
        <h3 className="border-b border-[#edf0f4] px-4 py-3 text-[13px] font-semibold text-[#18233d]">{block.title}</h3>
      ) : null}
      <div
        className={cn(
          "grid grid-cols-1 gap-px bg-[#edf0f4]",
          GRID_COLUMNS[block.items.length as keyof typeof GRID_COLUMNS] ?? "sm:grid-cols-2",
        )}
      >
        {block.items.map((item) => (
          <div className="bg-white px-4 py-3.5" key={item.label}>
            <Metric item={item} locale={locale} messages={messages} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Metric({
  item,
  locale,
  messages,
  emphasis = false,
}: {
  readonly item: MetricItem;
  readonly locale: string;
  readonly messages: AssistantMessages;
  readonly emphasis?: boolean;
}) {
  const trend = item.trend;
  const Icon = trend?.direction === "up"
    ? HiOutlineArrowTrendingUp
    : trend?.direction === "down"
      ? HiOutlineArrowTrendingDown
      : HiOutlineMinus;
  const direction = trend
    ? messages[trend.direction === "up" ? "trend.up" : trend.direction === "down" ? "trend.down" : "trend.flat"]
    : null;
  const tone = trend?.sentiment === "positive"
    ? "text-[#157a50]"
    : trend?.sentiment === "negative"
      ? "text-[#b4472f]"
      : "text-[#65718a]";

  return (
    <>
      <p className="text-[12px] font-medium text-[#65718a]">{item.label}</p>
      <p
        className={cn(
          "mt-1 font-semibold tracking-[-0.03em] text-[#101a35] tabular-nums",
          emphasis ? "text-[28px] leading-9" : "text-[19px] leading-7",
        )}
      >
        {formatAssistantMoney(item.value, locale)}
      </p>
      {trend ? (
        <p className={cn("mt-1 flex items-center gap-1.5 text-[12px] font-medium", tone)}>
          <Icon aria-hidden className="size-4 shrink-0" />
          {trend.label ? <span className="sr-only">{direction}: </span> : null}
          <span>{trend.label ?? direction}</span>
        </p>
      ) : null}
      {item.description ? <p className="mt-1.5 text-[12px] leading-5 text-[#7b859a]">{item.description}</p> : null}
    </>
  );
}
