export default function InboxLoading() {
  return (
    <main
      aria-label="Loading Inbox"
      className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
      <div className="h-8 w-32 animate-pulse rounded-[7px] bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" />
      <div className="mt-6 h-20 w-48 animate-pulse rounded-[11px] border border-[#edf0f4] bg-white motion-reduce:animate-none" />
      <div className="mt-7 flex gap-2">
        <span className="h-8 w-16 animate-pulse rounded-[8px] bg-[#eef2f7] motion-reduce:animate-none" />
        <span className="h-8 w-28 animate-pulse rounded-[8px] bg-[#f2f4f7] motion-reduce:animate-none" />
      </div>
      <section
        aria-label="Loading review queue"
        className="mt-5 overflow-hidden rounded-[12px] border border-[#e4e8ef] bg-white">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="flex items-center gap-4 border-b border-[#edf0f4] px-4 py-4 last:border-b-0 sm:px-5"
            key={index}>
            <span className="size-9 shrink-0 animate-pulse rounded-[10px] bg-[#eef2f7] motion-reduce:animate-none" />
            <span className="h-4 w-[min(36vw,260px)] animate-pulse rounded bg-[#eef2f7] motion-reduce:animate-none" />
            <span className="ml-auto h-4 w-20 animate-pulse rounded bg-[#eef2f7] motion-reduce:animate-none" />
          </div>
        ))}
      </section>
    </main>
  );
}
