import { TransactionIcon } from "@/components/pace/transaction-visuals/transaction-icon";

import type { TransactionListItem } from "../../types/transaction-ui.types";

export function TransactionMerchantCell({
  merchant,
  category,
  kind,
}: {
  readonly merchant: TransactionListItem["merchant"];
  readonly category?: TransactionListItem["category"];
  readonly kind: TransactionListItem["kind"];
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TransactionIcon
        categoryKey={category?.key}
        categoryName={category?.label}
        className="border-[#e1e7ef] shadow-[0_1px_2px_rgb(16_24_40/5%)] [&_img]:size-[22px]"
        iconKey={merchant.iconKey}
        merchantLogoKey={merchant.merchantLogoKey}
        merchantName={merchant.name}
        size="md"
        transactionKind={kind}
      />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-[#1b2844]">{merchant.name}</p>
        {merchant.description ? (
          <p className="mt-0.5 truncate text-[12px] leading-4 text-[#7b879e]">{merchant.description}</p>
        ) : null}
      </div>
    </div>
  );
}
