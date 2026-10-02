const ROWS = [0, 1, 2, 3, 4, 5, 6];
const pulse = "animate-pulse motion-reduce:animate-none";

export default function TransactionImportMappingLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className={`h-8 w-72 max-w-full rounded-[7px] bg-[#eef1f5] ${pulse}`} />
          <div className={`mt-2 h-4 w-80 max-w-full rounded bg-[#f3f5f8] ${pulse}`} />
        </div>
        <div className="flex items-center gap-2.5 rounded-[10px] border border-[#e5eaf1] bg-white px-3 py-2">
          <div className={`size-8 rounded-[8px] bg-[#e8f6ee] ${pulse}`} />
          <div className="space-y-1.5">
            <div className={`h-3 w-40 rounded bg-[#eef1f5] ${pulse}`} />
            <div className={`h-3 w-16 rounded bg-[#f3f5f8] ${pulse}`} />
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:gap-5">
        <div className="overflow-hidden rounded-[12px] border border-[#e5eaf1] bg-white">
          <div className="hidden h-10 border-b border-[#e5eaf1] bg-[#f8fafc] md:block" />
          <ul className="divide-y divide-[#eef1f5]">
            {ROWS.map((row) => (
              <li className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)] md:items-center md:gap-4" key={row}>
                <div className={`h-3.5 w-28 rounded bg-[#eef1f5] ${pulse}`} />
                <div className={`h-3.5 w-24 rounded bg-[#f3f5f8] ${pulse}`} />
                <div className="flex items-center gap-2">
                  <div className={`h-11 flex-1 rounded-[8px] border border-[#eef1f5] bg-[#fbfcfe] md:h-9 ${pulse}`} />
                  <div className={`h-6 w-16 rounded-[6px] bg-[#f1f4f8] md:w-21 ${pulse}`} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="h-fit space-y-3 rounded-[14px] border border-[#e5eaf1] bg-white px-5 py-5">
          <div className={`h-4 w-32 rounded bg-[#eef1f5] ${pulse}`} />
          {[0, 1, 2].map((item) => (
            <div className="flex items-center gap-2.5" key={item}>
              <div className={`size-4.5 rounded-full bg-[#e8f6ee] ${pulse}`} />
              <div className={`h-3 w-24 rounded bg-[#f3f5f8] ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
