import type { IconType } from "react-icons";

type InvitePermissionPreviewProps = {
  icon: IconType;
  title: string;
  description: string;
};

export function InvitePermissionPreview({ icon: Icon, title, description }: InvitePermissionPreviewProps) {
  return (
    <div className="flex min-w-0 gap-3 px-0 sm:px-4 sm:first:pl-0 sm:[&:not(:last-child)]:border-r sm:[&:not(:last-child)]:border-[#dde5f1]">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f0f5fd] text-[#46669d]">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[14px] font-semibold leading-5 text-[#13213d]">{title}</p>
        <p className="mt-1 text-[13px] leading-5 text-[#6076a1]">{description}</p>
      </div>
    </div>
  );
}
