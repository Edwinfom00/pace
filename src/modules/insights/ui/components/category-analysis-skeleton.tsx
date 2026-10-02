import { PaceChartSkeleton } from "@/components/pace/charts/pace-chart-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export function CategoryAnalysisSkeleton() {
  return (
    <main
      aria-busy="true"
      className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto grid w-full max-w-355 gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(330px,26vw,370px)] xl:items-start">
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-9 w-40" />
            <div className="flex gap-1.5">
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
            </div>
          </div>
          <div className="flex gap-1">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-22" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Skeleton className="col-span-2 h-28 lg:col-span-1" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <div className="rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
            <Skeleton className="mb-4 h-5 w-36" />
            <PaceChartSkeleton legend plotClassName="h-[230px] sm:h-[250px]" />
          </div>
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
            {[0, 1].map((card) => (
              <div
                className="space-y-4 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5"
                key={card}>
                <Skeleton className="h-5 w-32" />
                {[0, 1, 2, 3].map((row) => (
                  <Skeleton className="h-9 w-full" key={row} />
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-[10px] border border-[#e8ecf2] bg-white px-4 py-4 sm:px-5">
            <Skeleton className="h-5 w-44" />
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton className="h-11 w-full" key={row} />
            ))}
          </div>
        </div>
        <aside className="space-y-4 overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white px-5 py-5">
          <Skeleton className="h-6 w-40" />
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton className="h-5 w-full" key={row} />
          ))}
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </aside>
      </div>
    </main>
  );
}
