import type { IconType } from "react-icons";

import { Button } from "@/components/ui/button";

type AuthProviderButtonProps = {
  className?: string;
  icon: IconType;
  label: string;
  availability?: "available" | "coming-soon";
  comingSoonLabel: string;
  layout?: "inline" | "stacked";
};

export function AuthProviderButton({
  className,
  icon: Icon,
  label,
  availability = "available",
  comingSoonLabel,
  layout = "stacked",
}: AuthProviderButtonProps) {
  const isComingSoon = availability === "coming-soon";

  return (
    <Button
      aria-label={isComingSoon ? `${label}: ${comingSoonLabel}` : label}
      className={[
        "min-w-0 rounded-[0.6rem] border-[#dfe5ee] bg-white text-[0.79rem] font-medium text-[#17213a] shadow-none transition-[border-color,background-color,color,transform] hover:border-[#cbd5e4] hover:bg-[#fafcff] active:translate-y-px disabled:cursor-not-allowed disabled:border-[#e5e9f0] disabled:bg-[#f8f9fb] disabled:text-[#8892a7] disabled:opacity-100",
        layout === "inline"
          ? "h-12 flex-row gap-2 px-3"
          : "h-14 flex-col gap-1 px-2 [@media(max-height:850px)]:h-12",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isComingSoon}
      type="button"
      variant="outline"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Icon aria-hidden="true" className="size-[1.15rem] shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
      {isComingSoon ? (
        <span className="shrink-0 rounded-[0.24rem] bg-[#e9edf3] px-1.5 py-0.5 text-[0.6rem] leading-none font-semibold text-[#69758c]">
          {comingSoonLabel}
        </span>
      ) : null}
    </Button>
  );
}
