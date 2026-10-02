export default function TransactionImportMappingLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="h-8 w-72 max-w-full animate-pulse rounded-[7px] bg-[#eef1f5] motion-reduce:animate-none" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-[#f3f5f8] motion-reduce:animate-none" />
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:gap-5">
        <div className="h-[360px] animate-pulse rounded-[12px] border border-[#edf0f4] bg-[#fbfcfe] motion-reduce:animate-none" />
        <div className="h-[280px] animate-pulse rounded-[14px] border border-[#edf0f4] bg-[#fbfcfe] motion-reduce:animate-none" />
      </div>
    </main>
  );
}
