import { TransactionTableSkeleton } from "@/modules/transactions/ui/components/transaction-table-skeleton";

const pulse = "animate-pulse motion-reduce:animate-none";

export default function TransactionsLoading() {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className={`h-9 w-48 rounded-[8px] bg-[#eef1f5] ${pulse}`} />
      <div className={`mt-2 h-4 w-64 max-w-full rounded bg-[#f3f5f8] ${pulse}`} />
      <div className="mt-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <div className={`h-8 w-24 shrink-0 rounded-[8px] bg-[#f3f5f8] ${pulse}`} key={index} />
        ))}
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div className={`h-9 w-36 shrink-0 rounded-[8px] bg-[#f3f5f8] ${pulse}`} key={index} />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div className={`h-27 rounded-[12px] border border-[#edf0f4] bg-[#fbfcfe] ${pulse}`} key={index} />
        ))}
      </div>
      <section aria-label="Loading transactions" className="pt-4">
        <TransactionTableSkeleton rows={10} />
      </section>
    </main>
  );
}
