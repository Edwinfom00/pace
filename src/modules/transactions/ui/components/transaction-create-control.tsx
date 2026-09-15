"use client";

import { useState } from "react";
import { FiPlus } from "react-icons/fi";

import { Button } from "@/components/ui/button";

import { TransactionFormDialog } from "./transaction-form-dialog";
import {
  transactionFormKindLabels,
  type TransactionFormKind,
} from "./transaction-type-selector";

export function TransactionCreateControl() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TransactionFormKind>("EXPENSE");

  return (
    <>
      <Button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="h-9 rounded-[8px] bg-[#2563eb] px-3.5 text-[13px] font-medium text-white shadow-none hover:bg-[#1e55d1] focus-visible:ring-[#2563eb]/30"
        onClick={() => setOpen(true)}
        type="button"
      >
        <FiPlus aria-hidden="true" className="size-4" />
        Add transaction
      </Button>

      <TransactionFormDialog kind={kind} onKindChange={setKind} onOpenChange={setOpen} open={open}>
        {transactionFormKindLabels[kind]} form content
      </TransactionFormDialog>
    </>
  );
}
