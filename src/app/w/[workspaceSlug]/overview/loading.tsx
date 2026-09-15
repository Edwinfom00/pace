import { OverviewFinancialSkeleton } from "@/modules/overview/ui/components/overview-financial-skeleton";

export default function WorkspaceOverviewLoading() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto w-full max-w-[1100px]">
        <OverviewFinancialSkeleton />
      </div>
    </main>
  );
}
