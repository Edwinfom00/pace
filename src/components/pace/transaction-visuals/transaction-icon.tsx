import { cn } from "@/lib/utils";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import type { TransactionIconKey } from "@/lib/transaction-visuals/transaction-icon.types";

const sizeClasses = {
  sm: "size-8 rounded-[9px] [&_img]:size-4",
  md: "size-9 rounded-[10px] [&_img]:size-[18px]",
  lg: "size-11 rounded-[12px] [&_img]:size-5",
} as const;

const toneClasses = {
  FOOD: "bg-[#fff3e8] text-[#b45c1b]",
  TRANSPORT: "bg-[#edf3ff] text-[#2867e8]",
  HOME: "bg-[#f1efff] text-[#6656b8]",
  HEALTH: "bg-[#eaf8f1] text-[#15835a]",
  EDUCATION: "bg-[#eef5ff] text-[#3a68bd]",
  SHOPPING: "bg-[#fff0f4] text-[#b65378]",
  DIGITAL: "bg-[#f0f3f8] text-[#52627d]",
  FINANCE: "bg-[#eaf8f1] text-[#14845c]",
  INCOME: "bg-[#eaf8f1] text-[#14845c]",
  TRAVEL: "bg-[#edf7ff] text-[#2675a6]",
  COMMUNITY: "bg-[#fff3ec] text-[#b66a3f]",
  PETS: "bg-[#fff3e8] text-[#a96c37]",
  ELECTRONICS: "bg-[#eef2ff] text-[#5366b8]",
  AGRICULTURE: "bg-[#eff8ea] text-[#56823c]",
  DELIVERY: "bg-[#f5f3ff] text-[#735fbc]",
  PROFESSIONAL: "bg-[#f0f3f8] text-[#52627d]",
  UTILITIES: "bg-[#edf5ff] text-[#3f6db8]",
  GENERIC: "bg-[#f2f4f7] text-[#667085]",
} as const;

export function TransactionIcon({
  merchantName,
  categoryName,
  categoryKey,
  iconKey,
  transactionKind,
  size = "md",
  decorative = true,
  label,
  className,
}: {
  readonly merchantName?: string | null;
  readonly categoryName?: string | null;
  readonly categoryKey?: string | null;
  readonly iconKey?: TransactionIconKey | string | null;
  readonly transactionKind?: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | string | null;
  readonly size?: keyof typeof sizeClasses;
  readonly decorative?: boolean;
  readonly label?: string;
  readonly className?: string;
}) {
  const visual = resolveTransactionIcon({
    merchantName,
    categoryName,
    categoryKey,
    iconKey,
    transactionKind,
  });
  const accessibleLabel = label ?? visual.iconKey.replaceAll("-", " ");

  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-white/80",
        sizeClasses[size],
        toneClasses[visual.category],
        className,
      )}
      role={decorative ? undefined : "img"}
    >
      {/* Static SVG assets intentionally bypass next/image so only rendered icons are requested. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="block" decoding="async" height="20" loading="lazy" src={visual.iconPath} width="20" />
    </span>
  );
}
