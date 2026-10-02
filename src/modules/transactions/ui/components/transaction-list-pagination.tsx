"use client";

import {
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { TRANSACTION_PAGE_SIZES } from "../../domain/transaction-list-url";
import type { TransactionPaginationState } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

export type PaginationItem = number | "ellipsis-start" | "ellipsis-end";

export function paginationWindow(
  currentPage: number,
  totalPages: number,
): readonly PaginationItem[] {
  if (totalPages <= 7)
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis-start",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "ellipsis-start",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-end",
    totalPages,
  ];
}

export function TransactionListPagination({
  pagination,
  labels,
  loading = false,
  onPageChange,
  onPageSizeChange,
}: {
  readonly pagination: TransactionPaginationState;
  readonly labels: TransactionUiLabels;
  readonly loading?: boolean;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
}) {
  if (pagination.totalCount === 0) return null;

  const totalPages = Math.max(
    1,
    Math.ceil(pagination.totalCount / pagination.pageSize),
  );
  const currentPage = Math.min(Math.max(1, pagination.page), totalPages);
  const from = (currentPage - 1) * pagination.pageSize + 1;
  const to = Math.min(currentPage * pagination.pageSize, pagination.totalCount);

  return (
    <nav
      aria-label={labels.paginationPage}
      className="flex flex-col gap-3 border-t border-[#edf0f4] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-[12px] text-[#71809a]">
        {labels.paginationSummary
          .replace("{from}", String(from))
          .replace("{to}", String(to))
          .replace("{count}", String(pagination.totalCount))}
      </p>
      <div className="flex items-center gap-1">
        <Button
          aria-label={labels.paginationPrevious}
          className="size-8 rounded-[8px] border-[#e3e8ef] bg-white p-0 text-[#53627b] hover:bg-[#f8fafc]"
          disabled={loading || currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          size="icon"
          variant="outline">
          <HiOutlineChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        {paginationWindow(currentPage, totalPages).map((item) =>
          typeof item === "number" ? (
            <Button
              aria-current={item === currentPage ? "page" : undefined}
              aria-label={`${labels.paginationPage} ${item}`}
              className={cn(
                "size-8 rounded-[8px] p-0 text-[12px] tabular-nums",
                item === currentPage
                  ? "border-[#dbe7ff] bg-[#eef5ff] font-semibold text-[#2563eb] hover:bg-[#e6f0ff]"
                  : "border-transparent bg-transparent text-[#53627b] hover:bg-[#f3f6fa]",
              )}
              disabled={loading}
              key={item}
              onClick={() => onPageChange(item)}
              size="icon"
              variant={item === currentPage ? "outline" : "ghost"}>
              {item}
            </Button>
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex size-8 items-center justify-center text-[12px] text-[#8b98ae]"
              key={item}>
              …
            </span>
          ),
        )}
        <Button
          aria-label={labels.paginationNext}
          className="size-8 rounded-[8px] border-[#e3e8ef] bg-white p-0 text-[#53627b] hover:bg-[#f8fafc]"
          disabled={loading || currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          size="icon"
          variant="outline">
          <HiOutlineChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${labels.paginationPageSize}: ${pagination.pageSize}`}
            className="h-8 w-fit rounded-[8px] border-[#e3e8ef] bg-white px-2.5 text-[12px] font-medium text-[#53627b] hover:bg-[#f8fafc]"
            disabled={loading}
            variant="outline">
            {pagination.pageSize} {labels.paginationPerPage}
            <HiOutlineChevronDown
              aria-hidden="true"
              className="size-3.5 text-[#8b98ae]"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-36 rounded-[10px] border border-[#e7ebf1] bg-white p-1 shadow-[0_10px_25px_rgb(16_24_40/10%)]">
          {TRANSACTION_PAGE_SIZES.map((size) => (
            <DropdownMenuItem
              className={cn(
                "rounded-[7px] px-2.5 py-2 text-[13px] text-[#34405d] focus:bg-[#f3f6fa]",
                size === pagination.pageSize &&
                  "bg-[#f3f6fa] font-medium text-[#1b2844]",
              )}
              key={size}
              onSelect={() => onPageSizeChange(size)}>
              {size} {labels.paginationPerPage}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
