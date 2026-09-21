import { Skeleton } from "@/components/ui/skeleton";

export function RecurringOverviewSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading recurring activity" className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-36 rounded-[7px] bg-[#eef1f5]" />
          <Skeleton className="mt-2 h-4 w-80 max-w-full bg-[#f3f5f8]" />
        </div>
        <Skeleton className="h-9 w-28 rounded-[8px] bg-[#f1f4f8]" />
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <Skeleton className="h-29 rounded-[12px] border border-[#e8ecf1] bg-white" key={index} />)}
      </section>
      <div className="mt-7 flex gap-2">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-9 w-24 rounded-[9px] bg-[#f1f4f8]" key={index} />)}
      </div>
      <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-120 rounded-[12px] border border-[#e8ecf1] bg-white" />
        <Skeleton className="h-78 rounded-[12px] border border-[#e8ecf1] bg-white" />
      </section>
    </main>
  );
}
