"use client";

import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { TransactionPaginationState } from "../../types/transaction-ui.types";
import type { TransactionUiLabels } from "../transaction-ui-labels";

export function TransactionPagination({
  pagination,
  labels,
  onPageChange,
}: {
  readonly pagination: TransactionPaginationState;
  readonly labels: TransactionUiLabels;
  readonly onPageChange?: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
  const currentPage = Math.min(Math.max(1, pagination.page), totalPages);
  const from = pagination.totalCount === 0 ? 0 : (currentPage - 1) * pagination.pageSize + 1;
  const to = Math.min(currentPage * pagination.pageSize, pagination.totalCount);
  const pageNumbers = visiblePages(currentPage, totalPages);

  if (pagination.totalCount === 0) return null;

  return (
    <nav aria-label={labels.paginationPage} className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
          disabled={currentPage === 1}
          onClick={() => onPageChange?.(currentPage - 1)}
          size="icon"
          variant="outline"
        >
          <HiOutlineChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        {pageNumbers.map((page) => (
          <Button
            aria-current={page === currentPage ? "page" : undefined}
            aria-label={`${labels.paginationPage} ${page}`}
            className={cn(
              "size-8 rounded-[8px] p-0 text-[12px]",
              page === currentPage
                ? "border-[#e7f0ff] bg-[#eef5ff] text-[#2563eb] hover:bg-[#e6f0ff]"
                : "border-transparent bg-transparent text-[#667895] hover:bg-[#f3f6fa]",
            )}
            key={page}
            onClick={() => onPageChange?.(page)}
            size="icon"
            variant={page === currentPage ? "outline" : "ghost"}
          >
            {page}
          </Button>
        ))}
        <Button
          aria-label={labels.paginationNext}
          className="size-8 rounded-[8px] border-[#e3e8ef] bg-white p-0 text-[#53627b] hover:bg-[#f8fafc]"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange?.(currentPage + 1)}
          size="icon"
          variant="outline"
        >
          <HiOutlineChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <span className="ml-2 hidden whitespace-nowrap text-[12px] text-[#71809a] sm:inline">{pagination.pageSize} {labels.paginationPerPage}</span>
      </div>
    </nav>
  );
}

export function visiblePages(currentPage: number, totalPages: number): readonly number[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, totalPages];
  if (currentPage >= totalPages - 2) return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
}
