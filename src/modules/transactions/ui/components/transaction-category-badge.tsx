import type { TransactionListItem } from "../../types/transaction-ui.types";

export function TransactionCategoryBadge({
  category,
  uncategorizedLabel,
}: {
  readonly category?: TransactionListItem["category"];
  readonly uncategorizedLabel: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-full bg-[#f3f5f8] px-2.5 py-1 text-[12px] leading-4 text-[#667085]">
      {category?.label ?? uncategorizedLabel}
    </span>
  );
}
