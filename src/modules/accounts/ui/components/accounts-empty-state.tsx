import { HiOutlineWallet } from "react-icons/hi2";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AccountListFilter } from "@/modules/accounts/domain/accounts-overview";
import type { AccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";

export function AccountsEmptyState({ filter, labels }: { readonly filter: AccountListFilter; readonly labels: AccountsUiLabels }) {
  const copy = labels.empty[filter];
  return (
    <Empty className="min-h-67.5 rounded-[12px] border-[#e4e9f0] bg-white py-12">
      <EmptyHeader>
        <EmptyMedia className="mb-1 size-10 rounded-[12px] bg-[#eef4ff] text-[#2563eb]" variant="icon"><HiOutlineWallet aria-hidden="true" className="size-5" /></EmptyMedia>
        <EmptyTitle className="text-[15px] font-semibold text-[#1b2844]">{copy.title}</EmptyTitle>
        <EmptyDescription className="max-w-70 text-[13px] leading-5 text-[#71809a]">{copy.description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
