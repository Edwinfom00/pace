import { HiOutlineArchiveBox } from "react-icons/hi2";

import { formatOverviewMoney } from "@/modules/overview/domain/overview-formatters";
import { getAccountTypeMetadata } from "@/modules/ledger/ui/components/account-type-metadata";
import type { AccountOverviewItem } from "@/modules/accounts/domain/accounts-overview";
import type { AccountsUiLabels } from "@/modules/accounts/ui/accounts-ui-labels";

const iconToneByType = {
  CASH: "bg-[#eaf2ff] text-[#245ecc]",
  CHECKING: "bg-[#eaf2ff] text-[#245ecc]",
  SAVINGS: "bg-[#e7f8ef] text-[#25835a]",
  CREDIT_CARD: "bg-[#f1ecff] text-[#6945c7]",
  MOBILE_MONEY: "bg-[#fff2d9] text-[#9a6500]",
  OTHER: "bg-[#eef1f6] text-[#52627b]",
} as const;

export function AccountCard({
  account,
  labels,
  locale,
}: {
  readonly account: AccountOverviewItem;
  readonly labels: AccountsUiLabels;
  readonly locale: string;
}) {
  const Icon = getAccountTypeMetadata(account.type).icon;
  const currentBalance = formatOverviewMoney(account.currentBalanceMinor, account.currency, locale);
  const availableBalance = formatOverviewMoney(account.availableBalanceMinor, account.currency, locale);
  const accessibleName = `${account.name}. ${labels.type[account.type]}. ${labels.balanceCurrent}: ${currentBalance}. ${labels.balanceAvailable}: ${availableBalance}. ${labels.status[account.status]}.`;

  return (
    <article aria-label={accessibleName} className={account.status === "ARCHIVED" 
    ? "min-h-43 rounded-[12px] border border-dashed border-[#dce2ea] bg-[#fcfdff] p-4 text-[#23314d] sm:p-5"
     : "min-h-43 rounded-[12px] border border-[#e2e7ee] bg-white p-4 text-[#17233d] sm:p-5"}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-[12px] ${iconToneByType[account.type]}`}><Icon className="size-5" /></span>
          <div className="min-w-0 pt-0.5">
            <h2 className="truncate text-[15px] font-semibold tracking-[-0.018em]">{account.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#71809a]">
              <span>{labels.type[account.type]}</span>
              <span className="inline-flex items-center gap-1 text-[#64748b]">{account.status === "ARCHIVED" ? <HiOutlineArchiveBox aria-hidden="true" className="size-3.5" /> : null}{labels.status[account.status]}</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="sr-only">{labels.balanceCurrent}</p>
          <p className="text-[18px] font-semibold tracking-[-0.035em] text-[#101a35] sm:text-[20px]">{currentBalance}</p>
          <p className="mt-1 text-[12px] text-[#71809a]"><span className="sr-only">{labels.balanceAvailable}: </span>{labels.balanceAvailable} · {availableBalance}</p>
        </div>
      </div>
    </article>
  );
}
