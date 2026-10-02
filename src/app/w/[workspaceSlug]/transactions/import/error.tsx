"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FiArrowLeft } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import type { DashboardLanguage } from "@/i18n/dashboard-messages";
import { getImportUploadLabels } from "@/modules/imports/ui/import-upload-labels";

function currentLanguage(): DashboardLanguage {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  return language.startsWith("fr") ? "fr" : language.startsWith("de") ? "de" : "en";
}

export default function TransactionImportError({ reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const labels = getImportUploadLabels(currentLanguage());
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  return (
    <main className="mx-auto w-full max-w-360 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        className="inline-flex items-center gap-2 text-[13px] text-[#526788] hover:text-[#14213c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
        href={`/w/${workspaceSlug}/transactions`}
      >
        <FiArrowLeft aria-hidden />
        {labels.transactions}
      </Link>
      <h1 className="mt-4 text-[27px] font-semibold tracking-[-0.04em] text-[#101a35] sm:text-[30px]">{labels.title}</h1>
      <section className="mt-6 rounded-[14px] border border-[#e5eaf1] bg-white px-5 py-12 text-center" role="alert">
        <h2 className="text-[15px] font-semibold text-[#18243b]">{labels.errorTitle}</h2>
        <p className="mx-auto mt-1 max-w-sm text-[13px] leading-5 text-[#71809a]">{labels.errorDescription}</p>
        <Button className="mt-4 rounded-[9px]" onClick={reset} type="button" variant="outline">
          {labels.retry}
        </Button>
      </section>
    </main>
  );
}
