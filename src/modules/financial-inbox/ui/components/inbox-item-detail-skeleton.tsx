export function InboxItemDetailSkeleton({
  loadingLabel,
}: {
  readonly loadingLabel: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-label={loadingLabel}
      className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="h-4 w-28 animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" />
      <section className="mt-7 border-b border-[#edf0f4] pb-6">
        <div className="flex items-center gap-4">
          <span className="size-14 animate-pulse rounded-[15px] bg-[#f0f3f8] motion-reduce:animate-none" />
          <div className="min-w-0 flex-1">
            <div className="h-7 w-52 max-w-full animate-pulse rounded bg-[#eef1f5] motion-reduce:animate-none" />
            <div className="mt-3 h-4 w-36 animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" />
          </div>
          <span className="hidden h-7 w-28 animate-pulse rounded-[7px] bg-[#eef1f5] sm:block motion-reduce:animate-none" />
        </div>
      </section>
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(290px,320px)] xl:gap-7">
        <div className="space-y-4">
          <div className="h-42 animate-pulse rounded-[12px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" />
          <div className="h-51 animate-pulse rounded-[12px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" />
          <div className="h-43 animate-pulse rounded-[12px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" />
        </div>
        <aside className="space-y-4">
          <div className="h-44 animate-pulse rounded-[12px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" />
          <div className="h-39 animate-pulse rounded-[12px] border border-[#e6eaf0] bg-[#fcfdff] motion-reduce:animate-none" />
        </aside>
      </div>
    </main>
  );
}
