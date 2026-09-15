import { Skeleton } from "@/components/ui/skeleton";

export function TransactionTableSkeleton({ rows = 7 }: { readonly rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading transactions" className="hidden overflow-hidden rounded-[12px] border border-[#e7ebf1] bg-white md:block">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[#e7ebf1] bg-[#fcfdff]">
            {["merchant", "category", "account", "date", "amount", "status", "actions"].map((column) => (
              <th className="px-4 py-3" key={column}><Skeleton className="h-3 w-16 bg-[#eef1f5]" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, index) => (
            <tr className="border-b border-[#edf0f4] last:border-b-0" key={index}>
              <td className="px-4 py-3.5"><div className="flex items-center gap-3"><Skeleton className="size-8 rounded-[9px] bg-[#eef1f5]" /><div className="space-y-1.5"><Skeleton className="h-3 w-32 bg-[#eef1f5]" /><Skeleton className="h-2.5 w-20 bg-[#f3f5f8]" /></div></div></td>
              <td className="px-3 py-3.5"><Skeleton className="h-6 w-20 rounded-full bg-[#f3f5f8]" /></td>
              <td className="hidden px-3 py-3.5 xl:table-cell"><Skeleton className="h-3 w-24 bg-[#eef1f5]" /></td>
              <td className="px-3 py-3.5"><Skeleton className="h-3 w-20 bg-[#eef1f5]" /></td>
              <td className="px-3 py-3.5"><Skeleton className="ml-auto h-3 w-20 bg-[#eef1f5]" /></td>
              <td className="hidden px-3 py-3.5 xl:table-cell"><Skeleton className="h-6 w-16 rounded-full bg-[#f3f5f8]" /></td>
              <td className="px-3 py-3.5"><Skeleton className="ml-auto size-6 bg-[#f3f5f8]" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
