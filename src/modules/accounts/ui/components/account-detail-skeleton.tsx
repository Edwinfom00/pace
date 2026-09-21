import { Skeleton } from "@/components/ui/skeleton";

export function AccountDetailSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading account detail"
      className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
    >
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-[12px] bg-[#edf2fa]" />
          <div>
            <Skeleton className="h-7 w-44 bg-[#edf1f5]" />
            <Skeleton className="mt-2 h-4 w-32 bg-[#f2f5f8]" />
          </div>
        </div>
        <Skeleton className="h-9 w-30 rounded-[8px] bg-[#e8f1ff]" />
      </header>
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Skeleton className="h-23 rounded-[12px] border border-[#e6ebf2] bg-white" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton
                className="h-22 rounded-[11px] border border-[#e8edf3] bg-white"
                key={index}
              />
            ))}
          </div>
          <Skeleton className="h-76 rounded-[12px] border border-[#e8edf3] bg-white" />
          <Skeleton className="h-66 rounded-[12px] border border-[#e8edf3] bg-white" />
        </div>
        <aside className="space-y-4">
          <Skeleton className="h-48 rounded-[12px] border border-[#e8edf3] bg-white" />
          <Skeleton className="h-38 rounded-[12px] border border-[#e8edf3] bg-white" />
          <Skeleton className="h-58 rounded-[12px] border border-[#e8edf3] bg-white" />
        </aside>
      </div>
    </main>
  );
}
