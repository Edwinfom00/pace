import { Hash, MonitorSmartphone, PlusCircle } from "lucide-react";

import type { TransactionDetailData } from "@/modules/transactions/domain/transaction-detail";

export function TransactionSourceInformation({ transaction }: { readonly transaction: TransactionDetailData }) {
  return (
    <section aria-labelledby="transaction-source-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white px-4 py-4 sm:px-5">
      <h2 className="border-b border-[#edf0f4] pb-3 text-[17px] font-semibold tracking-tight text-[#101a35]" id="transaction-source-heading">Source &amp; additional information</h2>
      {transaction.source ? (
        <dl className="divide-y divide-[#f0f2f5] pt-1 text-[13px]">
          <div className="grid grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[13.25rem_minmax(0,1fr)]">
            <dt className="flex items-center gap-2.5 text-[#71809a]">
              <PlusCircle aria-hidden className="size-4 text-[#637491]" />
              Added
            </dt>
            <dd className="font-medium text-[#34405d]">
              {transaction.source.label}
            </dd>
          </div>
          {transaction.source.channel ?
            <div className="grid grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[13.25rem_minmax(0,1fr)]">
              <dt className="flex items-center gap-2.5 text-[#71809a]">
                <MonitorSmartphone aria-hidden className="size-4 text-[#637491]" />
                Source
              </dt>
              <dd className="font-medium text-[#34405d]">
                {transaction.source.channel}
              </dd>
            </div>
            : null}
          <div className="grid grid-cols-[minmax(8.5rem,13rem)_minmax(0,1fr)] gap-3 py-2.5 sm:grid-cols-[13.25rem_minmax(0,1fr)]">
            <dt className="flex items-center gap-2.5 text-[#71809a]">
              <Hash aria-hidden className="size-4 text-[#637491]" />
              Reference
            </dt>
            <dd className="text-[#71809a]">
              No reference available
            </dd>
          </div>
        </dl>
      ) :
        <p className="pt-3 text-[13px] leading-5 text-[#71809a]">
          No additional source information is available for this transaction.
        </p>
      }
    </section>
  );
}
