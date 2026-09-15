import { Skeleton } from "@/components/ui/skeleton";

export function OverviewFinancialSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="flex gap-2"><Skeleton className="h-9 w-14" /><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-16" /></div>
      <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-[104px]" /><Skeleton className="h-[104px]" /><Skeleton className="h-[104px]" />
      </div>
      <Skeleton className="h-[278px] w-full" />
      <div className="space-y-3 pt-1">
        <div className="flex justify-between"><Skeleton className="h-7 w-28" /><Skeleton className="h-5 w-12" /></div>
        <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
      </div>
      <div className="space-y-3 pt-2">
        <div className="flex justify-between"><Skeleton className="h-7 w-20" /><Skeleton className="h-5 w-12" /></div>
        <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
