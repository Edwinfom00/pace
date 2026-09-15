import { FiShield } from "react-icons/fi";

import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { AssistantBlock, DetailRow } from "./block-primitives";

type ApprovalData = Extract<PaceAssistantBlock, { type: "approval" }>;

export function ApprovalBlock({ block, labels }: { readonly block: ApprovalData; readonly labels: { readonly actionRequiresApproval: string; readonly edit: string; readonly confirm: string; readonly cancel: string } }) {
  return <AssistantBlock className="border-[#dbe7ff] p-3.5"><div className="flex items-start gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[#edf4ff] text-[#2f6fed]"><FiShield aria-hidden className="size-3.5" /></span><div><h3 className="text-[13px] font-semibold text-[#263149]">{block.title}</h3><p className="mt-1 text-[12px] leading-[18px] text-[#65718a]">{block.summary ?? labels.actionRequiresApproval}</p></div></div>{block.fields.length ? <dl className="mt-3 space-y-1.5 border-t border-[#e8effc] pt-3">{block.fields.map((field) => <DetailRow key={field.label} label={field.label} value={field.sensitive ? "••••" : field.value} />)}</dl> : null}<p className="mt-3 text-[11px] text-[#6d7a91]">{labels.actionRequiresApproval}</p></AssistantBlock>;
}
