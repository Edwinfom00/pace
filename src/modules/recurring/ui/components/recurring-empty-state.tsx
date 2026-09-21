import { FiRepeat } from "react-icons/fi";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import type { RecurringOverviewFilter } from "../../domain/recurring-overview";
import type { RecurringUiLabels } from "../recurring-ui-labels";

export function RecurringEmptyState({
  filter,
  labels,
}: {
  readonly filter: RecurringOverviewFilter;
  readonly labels: RecurringUiLabels;
}) {
  const copy = labels.empty[filter];
  return (
    <Empty className="min-h-67.5 rounded-[12px] border-[#e4e9f0] bg-white py-12">
      <EmptyHeader>
        <EmptyMedia className="mb-1 size-10 rounded-[12px] bg-[#eef4ff] text-[#2563eb]" variant="icon">
          <FiRepeat aria-hidden="true" className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-[15px] font-semibold text-[#1b2844]">{copy.title}</EmptyTitle>
        <EmptyDescription className="max-w-80 text-[13px] leading-5 text-[#71809a]">
          {copy.description}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
