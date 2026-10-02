const pulse = "animate-pulse motion-reduce:animate-none";

export default function TransactionImportMappingLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className={`h-8 w-72 max-w-full rounded-md bg-[#eef1f5] ${pulse}`} />
          <div className={`mt-2 h-4 w-80 max-w-full rounded-md bg-[#f3f5f8] ${pulse}`} />
        </div>
        <div className="flex items-center gap-2.5 rounded-md border border-[#e5eaf1] bg-white px-3 py-2">
          <div className={`size-8 rounded-md bg-[#e8f6ee] ${pulse}`} />
          <div className="space-y-1.5">
            <div className={`h-3 w-40 rounded-md bg-[#eef1f5] ${pulse}`} />
            <div className={`h-3 w-16 rounded-md bg-[#f3f5f8] ${pulse}`} />
          </div>
        </div>
      </div>
      <div className="rounded-md border border-[#e5eaf1] bg-white p-4 sm:p-5">
        <div className={`h-3.5 w-48 rounded-md bg-[#eef1f5] ${pulse}`} />
        <div className="mt-4 divide-y divide-[#eef1f5] rounded-md border border-[#e5eaf1]">
          {[0, 1, 2].map((row) => (
            <div className="flex items-center gap-3.5 px-4 py-3" key={row}>
              <div className={`size-10 rounded-md bg-[#f3efff] ${pulse}`} />
              <div className="flex-1 space-y-1.5">
                <div className={`h-3.5 w-36 rounded-md bg-[#eef1f5] ${pulse}`} />
                <div className={`h-3 w-48 max-w-full rounded-md bg-[#f3f5f8] ${pulse}`} />
              </div>
              <div className={`h-4 w-20 rounded-md bg-[#eef1f5] ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="grid h-fit gap-3 md:grid-cols-3">
          {[0, 1, 2].map((slot) => (
            <div className="space-y-3 rounded-md border border-[#e5eaf1] bg-white p-4" key={slot}>
              <div className={`size-10 rounded-md bg-[#eef3ff] ${pulse}`} />
              <div className={`h-3.5 w-24 rounded-md bg-[#eef1f5] ${pulse}`} />
              <div className={`h-11 rounded-md border border-[#eef1f5] bg-[#fbfcfe] md:h-10 ${pulse}`} />
            </div>
          ))}
        </div>
        <div className="h-fit space-y-3 rounded-md border border-[#e5eaf1] bg-white px-5 py-5">
          <div className={`h-4 w-40 rounded-md bg-[#eef1f5] ${pulse}`} />
          {[0, 1, 2, 3, 4].map((item) => (
            <div className="flex items-center gap-3" key={item}>
              <div className={`size-7 rounded-md bg-[#f1f4f8] ${pulse}`} />
              <div className={`h-3 w-28 rounded-md bg-[#f3f5f8] ${pulse}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
