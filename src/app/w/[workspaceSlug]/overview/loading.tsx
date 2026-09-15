import { OverviewFinancialSkeleton } from "@/modules/overview/ui/components/overview-financial-skeleton";
import { OverviewRightRailSkeleton } from "@/modules/overview/ui/components/overview-right-rail-skeleton";

export default function WorkspaceOverviewLoading() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto grid w-full max-w-[1420px] gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(330px,26vw,370px)] xl:items-start">
        <OverviewFinancialSkeleton />
        <OverviewRightRailSkeleton />
      </div>
    </main>
  );
}
