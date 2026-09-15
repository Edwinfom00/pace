import { HiOutlineArrowsRightLeft } from "react-icons/hi2";
import Link from "next/link";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { Button } from "@/components/ui/button";

import type { TransactionUiLabels } from "../transaction-ui-labels";

export function TransactionEmptyState({
  labels,
  filtered = false,
  clearFiltersHref,
}: {
  readonly labels: TransactionUiLabels;
  readonly filtered?: boolean;
  readonly clearFiltersHref?: string;
}) {
  return (
    <Empty className="min-h-[280px] rounded-[12px] border-[#e7ebf1] bg-white py-12">
      <EmptyHeader>
        <EmptyMedia className="mb-1 size-10 rounded-[12px] bg-[#f1f6ff] text-[#2563eb]" variant="icon">
          <HiOutlineArrowsRightLeft aria-hidden="true" className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-[15px] font-semibold text-[#1b2844]">{filtered ? labels.emptyNoResults : labels.emptyNoTransactions}</EmptyTitle>
        <EmptyDescription className="max-w-[280px] text-[13px] leading-5 text-[#71809a]">{filtered ? labels.emptyNoResults : labels.emptyDescription}</EmptyDescription>
        {filtered && clearFiltersHref ? (
          <Button asChild className="mt-3 h-8 rounded-[8px] border-[#d9e4f7] bg-white px-2.5 text-[12px] font-medium text-[#2563eb] hover:bg-[#f5f8ff]" variant="outline">
            <Link href={clearFiltersHref} scroll={false}>{labels.emptyClearFilters}</Link>
          </Button>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
