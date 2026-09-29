export function PlansOverviewSkeleton() {
  return (
    <main className="min-w-0 px-5 py-7 sm:px-7 sm:py-8 lg:px-10 lg:py-9"><div className="mx-auto max-w-[1420px] animate-pulse motion-reduce:animate-none"><div className="h-8 w-28 rounded bg-[#edf1f6]" /><div className="mt-2 h-4 w-80 max-w-full rounded bg-[#f2f4f8]" /><div className="mt-5 h-9 w-96 max-w-full rounded bg-[#f2f4f8]" /><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div className="h-24 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]" key={item} />)}</div><div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_clamp(300px,25vw,360px)]"><div className="h-96 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]" /><div className="h-80 rounded-[12px] border border-[#e8edf3] bg-[#fafbfd]" /></div></div></main>
  );
}
