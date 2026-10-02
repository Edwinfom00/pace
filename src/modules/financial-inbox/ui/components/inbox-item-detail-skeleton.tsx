const pulse = "animate-pulse bg-[#eef2f7] motion-reduce:animate-none";
const card = "rounded-[14px] border border-[#e5e9f0] bg-white px-5 py-5 sm:px-6";

export function InboxItemDetailSkeleton({
  loadingLabel,
}: {
  readonly loadingLabel: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={loadingLabel}
      className="mx-auto w-full max-w-330 px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex justify-between">
        <div className={`h-4 w-44 rounded ${pulse}`} />
        <div className={`h-4 w-24 rounded ${pulse}`} />
      </div>
      <div className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(330px,380px)] xl:gap-5">
        <div className="space-y-4">
          <section className={card}>
            <div className="flex items-start gap-5">
              <span className={`size-20 shrink-0 rounded-[18px] ${pulse}`} />
              <div className="min-w-0 flex-1 space-y-3 pt-1">
                <div className={`h-7 w-56 max-w-full rounded ${pulse}`} />
                <div className={`h-4 w-44 rounded ${pulse}`} />
                <div className="flex gap-2">
                  <span className={`h-7 w-20 rounded-[8px] ${pulse}`} />
                  <span className={`h-7 w-28 rounded-[8px] ${pulse}`} />
                </div>
              </div>
              <span className={`hidden h-8 w-36 rounded ${pulse} sm:block`} />
            </div>
            <div className="mt-6 grid grid-cols-4 gap-3 border-t border-[#edf0f4] pt-4">
              {Array.from({ length: 4 }, (_, index) => (
                <span className={`h-1.5 rounded-full ${pulse}`} key={index} />
              ))}
            </div>
          </section>
          {[8, 4, 3].map((rows) => (
            <section className={card} key={rows}>
              <div className={`h-5 w-48 rounded ${pulse}`} />
              <div className="mt-5 space-y-3.5">
                {Array.from({ length: rows }, (_, index) => (
                  <div className={`h-4 rounded ${pulse}`} key={index} style={{ width: `${88 - index * 7}%` }} />
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="space-y-4">
          {[3, 3, 1].map((rows, cardIndex) => (
            <section className={card} key={cardIndex}>
              <div className={`h-5 w-40 rounded ${pulse}`} />
              {Array.from({ length: rows }, (_, index) => (
                <div className="mt-4 flex items-center gap-3.5" key={index}>
                  <span className={`size-11 shrink-0 rounded-full ${pulse}`} />
                  <span className={`h-4 flex-1 rounded ${pulse}`} />
                </div>
              ))}
            </section>
          ))}
        </aside>
      </div>
    </main>
  );
}
