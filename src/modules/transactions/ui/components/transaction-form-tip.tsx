import { FiInfo } from "react-icons/fi";

export function TransactionFormTip({ description, title }: { readonly description: string; readonly title: string }) {
  return (
    <aside aria-label={title} className="flex items-start gap-2.5 rounded-[8px] border border-[#dbe7f5] bg-[#f4f8fd] px-3 py-2.5 text-[#405675]">
      <FiInfo aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#5a7ba9]" />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[#38516f]">{title}</p>
        <p className="mt-0.5 text-[12px] leading-5 text-[#526987]">{description}</p>
      </div>
    </aside>
  );
}
