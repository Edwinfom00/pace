export function PlansOverviewSkeleton() {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="h-8 w-32 animate-pulse rounded-[7px] bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" />
      <div className="mt-8 h-5 w-36 animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            className="h-52 animate-pulse rounded-[12px] border border-[#e9edf3] bg-[#fbfcfe] motion-reduce:animate-none"
            key={item}
          />
        ))}
      </div>
      <div className="mt-8 h-5 w-32 animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            className="h-48 animate-pulse rounded-[12px] border border-[#e9edf3] bg-[#fbfcfe] motion-reduce:animate-none"
            key={item}
          />
        ))}
      </div>
    </main>
  );
}
