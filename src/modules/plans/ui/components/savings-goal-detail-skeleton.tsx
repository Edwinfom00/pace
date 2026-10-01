import { Skeleton } from "@/components/ui/skeleton";

export function SavingsGoalDetailSkeleton() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355 animate-pulse motion-reduce:animate-none">
        <Skeleton className="h-4 w-28 bg-[#eef1f5]" />
        <div className="mt-5 flex items-center gap-3">
          <Skeleton className="size-11 rounded-[12px] bg-[#f0edff]" />
          <div>
            <Skeleton className="h-7 w-48 bg-[#edf1f5]" />
            <Skeleton className="mt-2 h-4 w-28 bg-[#f3f5f8]" />
          </div>
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(300px,25vw,360px)]">
          <div className="space-y-4">
            <Skeleton className="h-52 rounded-[12px] border border-[#e6ebf2] bg-white" />
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton
                  className="h-24 rounded-[12px] border border-[#e6ebf2] bg-white"
                  key={item}
                />
              ))}
            </div>
            <Skeleton className="h-52 rounded-[12px] border border-[#e6ebf2] bg-white" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-52 rounded-[12px] border border-[#e6ebf2] bg-white" />
            <Skeleton className="h-48 rounded-[12px] border border-[#e6ebf2] bg-white" />
          </div>
        </div>
      </div>
    </main>
  );
}
