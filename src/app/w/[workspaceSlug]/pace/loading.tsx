import { Skeleton } from "@/components/ui/skeleton";

export default function PaceAssistantLoading() {
  return (
    <main
      aria-busy="true"
      className="flex h-[calc(100dvh-4rem)] min-h-0 min-w-0 sm:h-[calc(100dvh-68px)]">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-[#e7eaf0] bg-white px-4 py-3 sm:px-7 lg:px-10">
          <div className="mx-auto w-full max-w-195 space-y-1.5">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </div>
        <div className="min-h-0 flex-1" />
        <div className="shrink-0 px-4 pt-2 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-7 lg:px-10">
          <Skeleton className="mx-auto h-21.5 w-full max-w-195 rounded-[14px]" />
        </div>
      </section>
      <aside className="hidden w-[320px] shrink-0 space-y-4 border-l border-[#e7eaf0] bg-white px-5 py-5 xl:block 2xl:w-87">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-5/6" />
      </aside>
    </main>
  );
}
