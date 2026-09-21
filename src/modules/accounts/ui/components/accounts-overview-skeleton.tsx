import { Skeleton } from "@/components/ui/skeleton";

export function AccountsOverviewSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading accounts" className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
        <div>
          <Skeleton className="h-8 w-36 rounded-[7px] bg-[#eef1f5]" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full bg-[#f3f5f8]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-26 rounded-[8px] bg-[#f1f4f8]" />
            <Skeleton className="h-9 w-32 rounded-[8px] bg-[#e5efff]" />
          </div>
      </header>
      <section className="rounded-[12px] border border-[#e5eaf1] bg-white p-5 sm:p-6">
        <Skeleton className="h-5 w-28 bg-[#eef1f5]" />
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Skeleton className="h-18 bg-[#f3f5f8]" />
          <Skeleton className="h-18 bg-[#f3f5f8]" />
          </div>
          </section>
      <div className="mt-7 flex gap-2">
        <Skeleton className="h-9 w-20 rounded-[9px] bg-[#e9f2ff]" />
        <Skeleton className="h-9 w-20 rounded-[9px] bg-[#f1f4f8]" />
        <Skeleton className="h-9 w-24 rounded-[9px] bg-[#f1f4f8]" />
        </div>
      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array
        .from({ length: 4 }, (_, index) => 
          <Skeleton className="h-43 rounded-[12px] border border-[#e8ecf1] bg-white" key={index} />
        )}
        </section>
    </main>
  );
}
