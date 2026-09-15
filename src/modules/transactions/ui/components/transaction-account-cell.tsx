import type { TransactionListItem } from "../../types/transaction-ui.types";

export function TransactionAccountCell({
  account,
  unavailableLabel,
}: {
  readonly account?: TransactionListItem["account"];
  readonly unavailableLabel: string;
}) {
  return (
    <span className="block max-w-[150px] truncate text-[12px] text-[#667895]">
      {account?.displayName ?? unavailableLabel}
    </span>
  );
}
