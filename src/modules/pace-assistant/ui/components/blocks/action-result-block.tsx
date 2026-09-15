import { FiCheckCircle, FiXCircle } from "react-icons/fi";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, DetailRow } from "./block-primitives";

type ActionResultData = Extract<PaceAssistantBlock, { type: "action-result" }>;

export function ActionResultBlock({ block }: { readonly block: ActionResultData }) {
  const success = block.status === "success";
  return <AssistantBlock className={success ? "border-[#d8f0e4] p-3.5" : "border-[#f4d8d4] p-3.5"}><div className="flex items-start gap-2.5"><span className={success ? "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#eaf9f0] text-[#168455]" : "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#fff1ef] text-[#b54708]"}>{success ? <FiCheckCircle aria-hidden className="size-4" /> : <FiXCircle aria-hidden className="size-4" />}</span><div><h3 className="text-[13px] font-semibold text-[#263149]">{block.title}</h3>{block.message ? <p className="mt-1 text-[12px] leading-[18px] text-[#65718a]">{block.message}</p> : null}</div></div>{block.fields.length ? <dl className="mt-3 space-y-1.5 border-t border-[#edf0f4] pt-3">{block.fields.map((field) => <DetailRow key={field.label} label={field.label} value={field.sensitive ? "••••" : field.value} />)}</dl> : null}</AssistantBlock>;
}
