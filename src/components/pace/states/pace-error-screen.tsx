"use client";

import { useEffect } from "react";
import Link from "next/link";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { Button } from "@/components/ui/button";

type PaceErrorScreenProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export function PaceErrorScreen({ error, retry }: PaceErrorScreenProps) {
  useEffect(() => {
    // Keep technical details out of the UI, while preserving them for local diagnosis.
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <main className="grid min-h-svh place-items-center bg-[#fbfcfe] px-6 py-10 text-[#17223b]">
      <section aria-labelledby="pace-error-title" className="w-full max-w-md text-center">
        <div className="mb-10 flex justify-center">
          <PaceLogo height={40} variant="full" width={134} />
        </div>
        <div className="mx-auto mb-6 grid size-12 place-items-center rounded-xl bg-[#eef3ff] text-lg font-semibold text-[#2457c5]">
          !
        </div>
        <h1 id="pace-error-title" className="text-balance text-2xl font-semibold tracking-[-0.025em]">
          We couldn’t open this page
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-6 text-[#667085]">
          Your information is safe. Please try again, or return to your Pace home and continue from there.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button className="h-10 bg-[#17223b] px-4 text-white hover:bg-[#34405d]" onClick={retry} type="button">
            Try again
          </Button>
          <Button asChild className="h-10 border-[#d9e1ee] bg-white px-4 text-[#34405d] hover:bg-[#f4f6fa]" variant="outline">
            <Link href="/">Go to Pace home</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
