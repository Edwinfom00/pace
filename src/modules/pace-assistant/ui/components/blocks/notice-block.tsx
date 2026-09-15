import { FiAlertCircle, FiCheckCircle, FiInfo } from "react-icons/fi";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";

type NoticeData = Extract<PaceAssistantBlock, { type: "notice" }>;

export function NoticeBlock({ block }: { readonly block: NoticeData }) {
  const Icon = block.tone === "success" ? FiCheckCircle : block.tone === "info" ? FiInfo : FiAlertCircle;
  const colors = block.tone === "success" ? "border-[#d8f0e4] bg-[#f4fcf7] text-[#137849]" : block.tone === "warning" ? "border-[#f6e5c6] bg-[#fffaf2] text-[#9a640d]" : block.tone === "error" ? "border-[#f5d9d4] bg-[#fff8f7] text-[#ad4332]" : "border-[#dce8ff] bg-[#f6f9ff] text-[#3567bd]";
  return <section className={`flex gap-2.5 rounded-[11px] border p-3 text-[12px] leading-[18px] ${colors}`} role={block.tone === "error" ? "alert" : "status"}><Icon aria-hidden className="mt-0.5 size-4 shrink-0" /><div>{block.title ? <h3 className="font-semibold">{block.title}</h3> : null}<p className={block.title ? "mt-0.5" : ""}>{block.message}</p></div></section>;
}
