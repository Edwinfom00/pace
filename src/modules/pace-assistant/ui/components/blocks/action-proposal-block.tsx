import { FiEdit3 } from "react-icons/fi";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, DetailRow } from "./block-primitives";

type ActionProposalData = Extract<PaceAssistantBlock, { type: "action-proposal" }>;

export function ActionProposalBlock({ block }: { readonly block: ActionProposalData }) {
  return <AssistantBlock className="p-3.5"><div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#edf4ff] text-[#2f6fed]"><FiEdit3 aria-hidden className="size-3.5" /></span><div className="min-w-0"><h3 className="text-[13px] font-semibold text-[#263149]">{block.title}</h3><p className="mt-1 text-[12px] leading-[18px] text-[#65718a]">{block.summary}</p></div></div>{block.fields.length ? <dl className="mt-3 space-y-1.5 border-t border-[#edf0f4] pt-3">{block.fields.map((field) => <DetailRow key={field.label} label={field.label} value={field.sensitive ? "••••" : field.value} />)}</dl> : null}</AssistantBlock>;
}
