import { PaceChartSkeleton } from "@/components/pace/charts/pace-chart-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function RecurringAnalyticsSkeleton() {
  return (
    <main
      aria-busy="true"
      className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto w-full max-w-355 space-y-4 sm:space-y-5">
        <div className="flex gap-1">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-40" />
          <div className="flex gap-1.5">
            <Skeleton className="size-8" />
            <Skeleton className="size-8" />
          </div>
        </div>
        <div className="flex gap-1">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-22" />
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[#e8ecf2] bg-white lg:grid-cols-4">
          {[0, 1, 2, 3].map((cell) => (
            <div className="space-y-2 px-4 py-3.5 sm:px-5" key={cell}>
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-3.5 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
            <Skeleton className="mb-4 h-5 w-56" />
            <PaceChartSkeleton legend plotClassName="h-56 sm:h-62" />
          </div>
          <div className="space-y-3 rounded-[10px] border border-dashed border-[#d6e0ee] bg-white px-4 py-4 sm:px-5">
            <div className="flex justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-7 w-32" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-14 w-full" />
            {[0, 1, 2].map((row) => (
              <Skeleton className="h-9 w-full" key={row} />
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-3 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
            <Skeleton className="h-5 w-40" />
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton className="h-11 w-full" key={row} />
            ))}
          </div>
          <div className="space-y-3 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
            <Skeleton className="h-5 w-32" />
            {[0, 1, 2].map((row) => (
              <Skeleton className="h-11 w-full" key={row} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
