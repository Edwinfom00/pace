import { FiArrowUpRight, FiInfo } from "react-icons/fi";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";

type InsightData = Extract<PaceAssistantBlock, { type: "insight" }>;

export function InsightBlock({ block }: { readonly block: InsightData }) {
  const isWarning = block.severity === "WARNING" || block.severity === "MEDIUM" || block.severity === "HIGH";
  const isCritical = block.severity === "CRITICAL";
  const iconClass = isCritical ? "bg-[#fff1ef] text-[#b54708]" : isWarning ? "bg-[#fff8ed] text-[#a86910]" : "bg-[#edf4ff] text-[#376fe6]";
  return <section className="rounded-[12px] border border-[#e7ebf1] bg-[#fcfdff] p-3.5"><div className="flex gap-2.5"><span className={`flex size-7 shrink-0 items-center justify-center rounded-[8px] ${iconClass}`}>{isWarning || isCritical ? <FiArrowUpRight aria-hidden className="size-3.5" /> : <FiInfo aria-hidden className="size-3.5" />}</span><div className="min-w-0"><h3 className="text-[13px] font-semibold text-[#263149]">{block.title}</h3><p className="mt-1 text-[12px] leading-[18px] text-[#637089]">{block.description}</p>{block.evidence.length ? <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] leading-4 text-[#7b859a]">{block.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div></div></section>;
}
