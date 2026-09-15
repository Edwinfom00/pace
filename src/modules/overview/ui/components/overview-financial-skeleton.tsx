import { Skeleton } from "@/components/ui/skeleton";

export function OverviewFinancialSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="flex gap-2"><Skeleton className="h-9 w-14" /><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-16" /></div>
      <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[104px]" /><Skeleton className="h-[104px]" /><Skeleton className="h-[104px]" />
      </div>
      <Skeleton className="h-[278px] w-full" />
    </div>
  );
}
