import { Skeleton } from "@/components/ui/skeleton";

export function OverviewRightRailSkeleton() {
  return (
    <aside aria-busy="true" className="overflow-hidden rounded-[14px] border border-[#e5e9f0] bg-white">
      <div className="space-y-4 px-5 py-5"><Skeleton className="h-6 w-24" /><Skeleton className="h-6 w-44" /><div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-5/6" /></div></div>
      <div className="space-y-4 border-t border-[#edf0f4] px-5 py-5"><Skeleton className="h-6 w-32" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
      <div className="border-t border-[#edf0f4] px-5 py-5"><Skeleton className="h-16 w-full" /></div>
      <div className="space-y-3 border-t border-[#edf0f4] px-5 py-5"><Skeleton className="h-6 w-20" /><Skeleton className="h-11 w-full" /><div className="flex gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-7 w-24" /></div></div>
    </aside>
  );
}
