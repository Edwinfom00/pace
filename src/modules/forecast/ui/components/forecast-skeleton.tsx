import { PaceChartSkeleton } from "@/components/pace/charts/pace-chart-skeleton";

const CARD = "rounded-[14px] border border-[#e8edf3] bg-white";

function Line({ className }: { className: string }) {
  return <span className={`block rounded-full bg-[#eef2f7] ${className}`} />;
}

export function ForecastSkeleton() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-355">
        <div className="animate-pulse motion-reduce:animate-none">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Line className="h-3 w-28" />
              <Line className="mt-5 h-7 w-36" />
              <Line className="mt-3 h-3 w-80 max-w-full" />
            </div>
            <div className="flex gap-2">
              <Line className="h-10 w-40 rounded-[10px]!" />
              <Line className="size-10 rounded-[10px]!" />
            </div>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div
                className={`${CARD} flex gap-3 p-4 ${item ? "hidden lg:flex" : ""}`}
                key={item}
              >
                <Line className="size-10" />
                <div className="flex-1">
                  <Line className="h-3 w-24" />
                  <Line className="mt-3 h-5 w-32" />
                  <Line className="mt-3 h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section className={`${CARD} p-4 sm:p-5`}>
            <div className="flex animate-pulse items-center justify-between motion-reduce:animate-none">
              <Line className="h-4 w-48" />
              <Line className="h-9 w-36 rounded-[9px]!" />
            </div>
            <PaceChartSkeleton className="mt-5" plotClassName="h-60 sm:h-72" />
          </section>
          <section
            className={`${CARD} animate-pulse space-y-4 p-4 motion-reduce:animate-none sm:p-5`}
          >
            <Line className="h-4 w-40" />
            {[0, 1, 2].map((row) => (
              <div className="flex items-center gap-3" key={row}>
                <Line className="size-6" />
                <Line className="h-3 flex-1" />
                <Line className="h-3 w-20" />
              </div>
            ))}
            <Line className="mt-6 h-4 w-28" />
            {[0, 1, 2].map((row) => (
              <div className="flex gap-3" key={row}>
                <Line className="size-6" />
                <div className="flex-1 space-y-2">
                  <Line className="h-3 w-3/4" />
                  <Line className="h-3 w-full" />
                </div>
              </div>
            ))}
          </section>
        </div>
        <div className="mt-4 grid animate-pulse gap-4 motion-reduce:animate-none lg:grid-cols-2">
          {[0, 1].map((card) => (
            <section className={`${CARD} space-y-4 p-4 sm:p-5`} key={card}>
              <Line className="h-4 w-44" />
              {[0, 1, 2, 3].map((row) => (
                <div className="flex items-center gap-3" key={row}>
                  <Line className="size-8" />
                  <div className="flex-1 space-y-2">
                    <Line className="h-3 w-28" />
                    <Line className="h-2.5 w-20" />
                  </div>
                  <Line className="h-3 w-20" />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
