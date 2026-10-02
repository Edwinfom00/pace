const CARD = "rounded-[14px] border border-[#e8edf3] bg-white";

function Line({ className }: { className: string }) {
  return <span className={`block rounded-full bg-[#eef2f7] ${className}`} />;
}

export function RuleDetailSkeleton({ className = "" }: { className?: string }) {
  return (
    <section
      aria-hidden
      className={`${CARD} animate-pulse space-y-4 p-4 motion-reduce:animate-none sm:p-5 ${className}`}
      data-rule-detail-skeleton
    >
      <div className="flex gap-3">
        <Line className="size-11 rounded-[12px]!" />
        <div className="flex-1 space-y-2">
          <Line className="h-4 w-2/3" />
          <Line className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Line className="size-9 rounded-[9px]!" />
        <Line className="h-9 w-24 rounded-[9px]!" />
      </div>
      <Line className="mt-6 h-4 w-28" />
      {[0, 1, 2, 3, 4].map((row) => (
        <div className="flex gap-4" key={row}>
          <Line className="h-3 w-20" />
          <Line className="h-3 flex-1" />
        </div>
      ))}
      <Line className="mt-6 h-4 w-36" />
      {[0, 1, 2].map((row) => (
        <div className="flex items-center gap-3" key={row}>
          <Line className="size-8 rounded-[9px]!" />
          <div className="flex-1 space-y-2">
            <Line className="h-3 w-28" />
            <Line className="h-2.5 w-20" />
          </div>
          <Line className="h-5 w-20 rounded-[6px]!" />
        </div>
      ))}
    </section>
  );
}

export function RulesSkeleton() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9" data-rules-skeleton>
      <div className="mx-auto max-w-355">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="min-w-0 animate-pulse motion-reduce:animate-none">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Line className="h-3 w-24" />
                <Line className="mt-4 h-7 w-28" />
                <Line className="mt-3 h-3 w-80 max-w-full" />
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Line className="h-10 flex-1 rounded-[10px]! sm:w-56 sm:flex-none" />
                <Line className="hidden h-10 w-36 rounded-[10px]! sm:block" />
                <Line className="h-10 w-28 rounded-[10px]!" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div className={`${CARD} flex gap-3 p-4`} key={item}>
                  <Line className="size-10" />
                  <div className="flex-1">
                    <Line className="h-5 w-12" />
                    <Line className="mt-3 h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
            <div className={`${CARD} mt-4 divide-y divide-[#edf0f4]`}>
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div className="flex items-center gap-3 px-4 py-3.5" key={row}>
                  <Line className="size-8 rounded-[9px]!" />
                  <div className="flex-1 space-y-2">
                    <Line className="h-3 w-40" />
                    <Line className="h-2.5 w-56 max-w-full" />
                  </div>
                  <Line className="hidden h-5 w-24 rounded-[6px]! md:block" />
                  <Line className="h-5 w-16 rounded-full!" />
                </div>
              ))}
            </div>
          </div>
          <RuleDetailSkeleton className="hidden xl:block" />
        </div>
      </div>
    </main>
  );
}
