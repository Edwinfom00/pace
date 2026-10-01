export function ForecastSkeleton() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-355 animate-pulse motion-reduce:animate-none">
        <div className="h-4 w-14 rounded bg-[#edf1f6]" />
        <div className="mt-2 h-8 w-36 rounded bg-[#edf1f6]" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-[#f2f4f8]" />
        <div className="mt-5 h-10 w-44 rounded-[10px] bg-[#f2f4f8]" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              className="h-25 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]"
              key={item}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="h-95 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]" />
          <div className="h-80 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]" />
        </div>
      </div>
    </main>
  );
}
