import Link from "next/link";
import { FileUp } from "lucide-react";

import { transactionImportHref } from "@/modules/imports/ui/import-upload-flow";

export function TransactionImportLink({ workspaceSlug, label }: { readonly workspaceSlug: string; readonly label: string }) {
  return (
    <Link
      className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#9dbcf7] bg-white px-3 text-[12px] font-medium text-[#2563eb] transition-colors hover:border-[#2563eb] hover:bg-[#f5f8ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
      href={transactionImportHref(workspaceSlug)}
    >
      <FileUp aria-hidden className="size-3.5" />
      {label}
    </Link>
  );
}
