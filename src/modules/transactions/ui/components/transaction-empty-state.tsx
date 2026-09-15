import { HiOutlineArrowsRightLeft } from "react-icons/hi2";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import type { TransactionUiLabels } from "../transaction-ui-labels";

export function TransactionEmptyState({ labels }: { readonly labels: TransactionUiLabels }) {
  return (
    <Empty className="min-h-[280px] rounded-[12px] border-[#e7ebf1] bg-white py-12">
      <EmptyHeader>
        <EmptyMedia className="mb-1 size-10 rounded-[12px] bg-[#f1f6ff] text-[#2563eb]" variant="icon">
          <HiOutlineArrowsRightLeft aria-hidden="true" className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-[15px] font-semibold text-[#1b2844]">{labels.emptyTitle}</EmptyTitle>
        <EmptyDescription className="max-w-[280px] text-[13px] leading-5 text-[#71809a]">{labels.emptyDescription}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
