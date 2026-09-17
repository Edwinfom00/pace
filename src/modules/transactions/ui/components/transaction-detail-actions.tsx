import { MoreHorizontal, Pencil, RefreshCw } from "lucide-react";

export function TransactionDetailActions() {
  return (
    <section aria-labelledby="transaction-actions-heading" className="rounded-[13px] border border-[#e6eaf0] bg-white p-4 sm:p-4.5">
      <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-[#101a35]" id="transaction-actions-heading">Actions</h2>
      <div className="mt-3 space-y-2">
        <button className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#e5e9f0] text-[13px] font-medium text-[#8a96a8]" disabled type="button"><Pencil aria-hidden className="size-4" />Edit transaction</button>
        <button className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#e2e7ef] bg-white text-[13px] font-medium text-[#8a96a8]" disabled type="button"><RefreshCw aria-hidden className="size-4" />Create refund</button>
        <button className="flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-[#e2e7ef] bg-white text-[13px] font-medium text-[#8a96a8]" disabled type="button"><MoreHorizontal aria-hidden className="size-4" />More actions</button>
      </div>
      <p className="mt-3 text-[12px] leading-5 text-[#71809a]">Editing, refunds, and other actions are not available yet.</p>
    </section>
  );
}
