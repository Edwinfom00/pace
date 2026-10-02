const pulse = "animate-pulse motion-reduce:animate-none";

export default function TransactionImportReviewLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className={`h-8 w-56 max-w-full rounded-md bg-[#eef1f5] ${pulse}`} />
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
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <div className="grid h-fit grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((tile) => (
            <div className="space-y-3 rounded-md border border-[#e5eaf1] bg-white p-4" key={tile}>
              <div className={`size-9 rounded-md bg-[#eef3ff] ${pulse}`} />
              <div className={`h-6 w-12 rounded-md bg-[#eef1f5] ${pulse}`} />
              <div className={`h-3 w-24 rounded-md bg-[#f3f5f8] ${pulse}`} />
            </div>
          ))}
        </div>
        <div className="h-fit space-y-3 rounded-md border border-[#e5eaf1] bg-white p-5">
          <div className={`h-4 w-28 rounded-md bg-[#eef1f5] ${pulse}`} />
          <div className={`h-11 rounded-md border border-[#eef1f5] bg-[#fbfcfe] md:h-10 ${pulse}`} />
        </div>
      </div>
    </main>
  );
}
