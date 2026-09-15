import { TransactionTableSkeleton } from "@/modules/transactions/ui/components/transaction-table-skeleton";

export default function TransactionsLoading() {
  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="h-8 w-40 animate-pulse rounded-[7px] bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" />
      <div className="mt-5 h-[94px] animate-pulse rounded-[12px] border-y border-[#edf0f4] bg-[#fbfcfe] motion-reduce:animate-none" />
      <section aria-label="Loading transactions" className="pt-5">
        <TransactionTableSkeleton />
      </section>
    </main>
  );
}
