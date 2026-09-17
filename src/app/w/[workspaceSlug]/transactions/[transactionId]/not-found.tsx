import Link from "next/link";

export default function TransactionDetailNotFound() {
  return (
    <main className="mx-auto flex min-h-[52vh] w-full max-w-[760px] flex-col justify-center px-4 py-10 sm:px-6">
      <p className="text-[13px] font-medium text-[#637491]">Transaction unavailable</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em] text-[#101a35]">This transaction could not be found.</h1>
      <p className="mt-3 max-w-[560px] text-[14px] leading-6 text-[#71809a]">It may no longer be available in this workspace.</p>
      <Link className="mt-6 inline-flex w-fit items-center rounded-[8px] bg-[#2563eb] px-3.5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563eb]" href="../">Back to transactions</Link>
    </main>
  );
}
