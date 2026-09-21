"use client";

import { HiOutlineExclamationTriangle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";

export function AccountsErrorState({
  onRetry,
  retry,
  title,
}: {
  readonly onRetry: () => void;
  readonly retry: string;
  readonly title: string;
}) {
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <section aria-live="polite" className="flex min-h-70 flex-col items-center justify-center rounded-[12px] border border-[#f1d9d5] bg-[#fffdfd] px-6 text-center">
        <span className="grid size-10 place-items-center rounded-[12px] bg-[#fff2f0] text-[#b5473c]"><HiOutlineExclamationTriangle aria-hidden="true" className="size-5" /></span>
        <h1 className="mt-3 text-[15px] font-semibold text-[#522b26]">{title}</h1>
        <Button className="mt-4 h-8 rounded-[8px] border-[#ead6d1] bg-white px-3 text-[12px] font-medium text-[#9b4036] hover:bg-[#fff7f6]" onClick={onRetry} variant="outline">{retry}</Button>
      </section>
    </main>
  );
}
