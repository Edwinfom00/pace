const pulse = "animate-pulse bg-[#eef2f7] motion-reduce:animate-none";

export default function InboxLoading() {
  return (
    <main
      aria-label="Loading Inbox"
      className="grid min-h-[calc(100svh-4rem)] w-full bg-white xl:grid-cols-[minmax(0,1fr)_clamp(340px,27vw,390px)]">
      <section className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-8 xl:px-10">
        <div className={`h-9 w-36 rounded-[8px] ${pulse}`} />
        <div className={`mt-2 h-4 w-64 max-w-full rounded ${pulse}`} />
        <div className="mt-5 flex gap-2">
          {[64, 112, 136, 96, 88].map((width) => (
            <span className={`h-9 shrink-0 rounded-[8px] ${pulse}`} key={width} style={{ width }} />
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="flex items-center gap-4 rounded-[12px] border border-[#edf0f4] px-5 py-5" key={index}>
              <span className={`size-12 shrink-0 rounded-[12px] ${pulse}`} />
              <span className="flex-1 space-y-2">
                <span className={`block h-3 w-20 rounded ${pulse}`} />
                <span className={`block h-6 w-16 rounded ${pulse}`} />
              </span>
            </div>
          ))}
        </div>
        <div className={`mt-9 h-6 w-40 rounded ${pulse}`} />
        <section aria-label="Loading review queue" className="mt-3 border-t border-[#e8ecf2]">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="flex items-center gap-4 border-b border-[#edf0f4] py-4" key={index}>
              <span className={`size-11 shrink-0 rounded-[12px] ${pulse}`} />
              <span className={`h-4 w-[min(30vw,200px)] rounded ${pulse}`} />
              <span className={`ml-auto h-8 w-20 rounded-[7px] ${pulse}`} />
            </div>
          ))}
        </section>
      </section>
      <aside className="hidden border-l border-[#e8ecf2] px-6 py-8 xl:block">
        <div className={`h-7 w-28 rounded ${pulse}`} />
        <div className={`mt-7 h-5 w-36 rounded ${pulse}`} />
        {Array.from({ length: 4 }, (_, index) => (
          <div className="mt-5 flex items-center gap-3.5" key={index}>
            <span className={`size-11 shrink-0 rounded-full ${pulse}`} />
            <span className={`h-4 flex-1 rounded ${pulse}`} />
          </div>
        ))}
        <div className={`mt-8 h-32 rounded-[10px] ${pulse}`} />
      </aside>
    </main>
  );
}
