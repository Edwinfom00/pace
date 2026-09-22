import type { RecurringPaymentStatus } from "@/modules/financial-inbox/domain";

import type { RecurringUiLabels } from "../recurring-ui-labels";

const statusClasses = {
  CANDIDATE: "border-[#f2dfba] bg-[#fff9ee] text-[#9a6700]",
  CONFIRMED: "border-[#cfeeda] bg-[#effaf2] text-[#167345]",
  IGNORED: "border-[#e0e5ec] bg-[#f5f7f9] text-[#64748b]",
} as const;

export function RecurringStatusBadge({
  labels,
  status,
}: {
  readonly labels: Pick<RecurringUiLabels, "status">;
  readonly status: RecurringPaymentStatus;
}) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses[status]}`}>
      {labels.status[status]}
    </span>
  );
}
