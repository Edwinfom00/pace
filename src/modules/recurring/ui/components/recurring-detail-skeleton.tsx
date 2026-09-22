import { Skeleton } from "@/components/ui/skeleton";

export function RecurringDetailSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading recurring detail" className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Skeleton className="h-4 w-36 bg-[#f0f3f7]" />
      <header className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Skeleton className="size-13 rounded-[12px] bg-[#edf2f8]" />
          <div>
            <Skeleton className="h-7 w-44 bg-[#edf1f5]" />
            <Skeleton className="mt-2 h-4 w-32 bg-[#f2f5f8]" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-[8px] bg-[#edf3fb]" />
      </header>
      <div className="mt-6 flex gap-5 border-b border-[#e4e9f0] pb-3">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-4 w-22 bg-[#f0f3f7]" key={index} />)}
      </div>
      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-24 rounded-[12px] border border-[#e6ebf1] bg-white" key={index} />)}
      </section>
      <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(290px,.92fr)]">
        <Skeleton className="h-120 rounded-[12px] border border-[#e6ebf1] bg-white" />
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-[12px] border border-[#e6ebf1] bg-white" />
          <Skeleton className="h-48 rounded-[12px] border border-[#e6ebf1] bg-white" />
        </div>
      </section>
    </main>
  );
}
