import {
  HiOutlineExclamationTriangle,
  HiOutlineEye,
  HiOutlineInformationCircle,
} from "react-icons/hi2";

import { cn } from "@/lib/utils";
import type { PaceAssistantBlock } from "@/modules/pace-assistant/types/pace-assistant";

import type { AssistantMessages } from "../assistant-messages";

type InsightBlock = Extract<PaceAssistantBlock, { type: "insight" }>;

export function InsightResult({
  block,
  messages,
}: {
  readonly block: InsightBlock;
  readonly messages: AssistantMessages;
}) {
  const level =
    block.severity === "CRITICAL" || block.severity === "HIGH"
      ? "critical"
      : block.severity === "WARNING" || block.severity === "MEDIUM"
        ? "warning"
        : "info";
  const Icon =
    level === "critical"
      ? HiOutlineExclamationTriangle
      : level === "warning"
        ? HiOutlineEye
        : HiOutlineInformationCircle;
  const tone =
    level === "critical"
      ? "bg-[#fff1ee] text-[#a8402a]"
      : level === "warning"
        ? "bg-[#fff7ea] text-[#8f5d0c]"
        : "bg-[#eef4ff] text-[#2457c5]";

  return (
    <section className="rounded-[12px] border border-[#e5e9f0] bg-white px-4 py-3.5">
      <p
        className={cn(
          "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] font-semibold",
          tone,
        )}>
        <Icon aria-hidden className="size-3.5" />
        {messages[`insight.severity.${level}`]}
      </p>
      <h3 className="mt-2.5 text-[14px] font-semibold text-[#18233d]">
        {block.title}
      </h3>
      <p className="mt-1 text-[13px] leading-5 text-[#536079]">
        {block.description}
      </p>
      {block.evidence.length ? (
        <ul className="mt-2.5 space-y-1 border-t border-[#edf0f4] pt-2.5 text-[12px] leading-5 text-[#65718a]">
          {block.evidence.map((item) => (
            <li className="flex gap-2" key={item}>
              <span
                aria-hidden
                className="mt-2 size-1 shrink-0 rounded-full bg-[#a4afbf]"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
