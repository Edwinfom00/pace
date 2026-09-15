import Link from "next/link";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#fbfcfe] px-6 py-10 text-[#17223b]">
      <section aria-labelledby="pace-not-found-title" className="w-full max-w-md text-center">
        <div className="mb-10 flex justify-center">
          <PaceLogo height={40} variant="full" width={134} />
        </div>
        <p className="text-sm font-medium text-[#2457c5]">Page not found</p>
        <h1 id="pace-not-found-title" className="mt-2 text-balance text-2xl font-semibold tracking-[-0.025em]">
          This page isn’t part of your Pace
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-pretty text-sm leading-6 text-[#667085]">
          The link may be out of date, or you may not have access to the workspace it belongs to.
        </p>
        <Button asChild className="mt-7 h-10 bg-[#17223b] px-4 text-white hover:bg-[#34405d]">
          <Link href="/">Return to Pace home</Link>
        </Button>
      </section>
    </main>
  );
}
