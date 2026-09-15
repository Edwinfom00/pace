import { PaceLogo } from "@/components/pace/brand/pace-logo";

export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" className="grid min-h-svh place-items-center bg-[#fbfcfe] px-6 py-10 text-[#17223b]">
      <section className="w-full max-w-2xl">
        <div className="flex items-center justify-between gap-6">
          <PaceLogo height={36} variant="full" width={120} />
          <div className="flex items-center gap-2 text-sm text-[#667085]" role="status">
            <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-[#d6e1f6] border-t-[#2457c5] motion-reduce:animate-none" />
            <span>Loading Pace</span>
          </div>
        </div>
        <div aria-hidden="true" className="mt-10 grid gap-4">
          <div className="h-7 w-40 animate-pulse rounded-md bg-[#eaf0fb] motion-reduce:animate-none" />
          <div className="grid gap-3 rounded-xl bg-white p-6 shadow-[0_8px_8px_rgb(16_24_40/0.04)]">
            <div className="h-4 w-24 animate-pulse rounded-md bg-[#eef2f7] motion-reduce:animate-none" />
            <div className="h-8 w-2/5 animate-pulse rounded-md bg-[#eaf0fb] motion-reduce:animate-none" />
            <div className="mt-3 h-px bg-[#edf0f5]" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-14 animate-pulse rounded-lg bg-[#f4f6fa] motion-reduce:animate-none" />
              <div className="h-14 animate-pulse rounded-lg bg-[#f4f6fa] motion-reduce:animate-none" />
              <div className="h-14 animate-pulse rounded-lg bg-[#f4f6fa] motion-reduce:animate-none" />
            </div>
          </div>
        </div>
        <p className="sr-only">Loading Pace</p>
      </section>
    </main>
  );
}
