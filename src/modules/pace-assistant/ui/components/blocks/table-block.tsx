import { formatAssistantMoney } from "../../../domain/formatters";
import type { PaceAssistantBlock } from "../../../types/pace-assistant";
import { BlockTitle } from "./block-primitives";

type TableBlockData = Extract<PaceAssistantBlock, { type: "table" }>;

export function TableBlock({ block, locale }: { readonly block: TableBlockData; readonly locale: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#e8ebf1] bg-white">
      {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
      <div className="divide-y divide-[#edf0f4] sm:hidden">
        {block.rows.map((row, rowIndex) => <dl className="space-y-1.5 px-3.5 py-3" key={rowIndex}>{block.columns.map((column) => {
          const cell = row[column.key] ?? "";
          const rendered = typeof cell === "string" ? cell : formatAssistantMoney(cell.value, locale);
          return <div className="flex items-baseline justify-between gap-4" key={column.key}><dt className="text-[11px] text-[#7b859a]">{column.label}</dt><dd className="text-right text-[12px] font-medium text-[#3f4b64] tabular-nums">{rendered}</dd></div>;
        })}</dl>)}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[440px] text-left text-xs">
          <thead className="border-b border-[#edf0f4] bg-[#fbfcfe] text-[#7b859a]">
            <tr>{block.columns.map((column) => <th className={column.align === "right" ? "px-3.5 py-2.5 text-right font-medium" : "px-3.5 py-2.5 font-medium"} key={column.key} scope="col">{column.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f4] text-[#3f4b64]">
            {block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.columns.map((column) => {
              const cell = row[column.key] ?? "";
              const rendered = typeof cell === "string" ? cell : formatAssistantMoney(cell.value, locale);
              return <td className={column.align === "right" ? "px-3.5 py-2.5 text-right font-medium tabular-nums" : "px-3.5 py-2.5"} data-label={column.label} key={column.key}>{rendered}</td>;
            })}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
