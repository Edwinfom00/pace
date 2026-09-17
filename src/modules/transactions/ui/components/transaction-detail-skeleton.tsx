export function TransactionDetailSkeleton() {
  return (
    <main aria-busy="true" aria-label="Loading transaction" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="h-4 w-28 animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" />
      <section className="mt-7 flex items-center justify-between gap-6 border-b border-[#edf0f4] pb-6"><div className="flex items-center gap-4"><div className="size-[68px] animate-pulse rounded-[17px] bg-[#f1f4f8] motion-reduce:animate-none" /><div><div className="h-8 w-44 animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" /><div className="mt-3 h-4 w-28 animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" /></div></div><div className="hidden h-8 w-36 animate-pulse rounded bg-[#eef1f5] sm:block motion-reduce:animate-none" /></section>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,320px)]"><div className="space-y-4"><div className="h-[275px] animate-pulse rounded-[13px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" /><div className="h-[172px] animate-pulse rounded-[13px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" /><div className="h-[140px] animate-pulse rounded-[13px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" /></div><aside className="space-y-4"><div className="h-[210px] animate-pulse rounded-[13px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" /><div className="h-[260px] animate-pulse rounded-[13px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" /></aside></div>
    </main>
  );
}
