import { FiLink } from "react-icons/fi";

type InviteSharePanelProps = {
  description: string;
  generateLabel: string;
  disabled: boolean;
  onGenerate: () => void;
};

export function InviteSharePanel({ description, generateLabel, disabled, onGenerate }: InviteSharePanelProps) {
  return (
    <div className="px-7 py-7 sm:px-8">
      <div className="flex gap-4 rounded-[10px] bg-[#f2f6fd] px-5 py-4 text-[#233d69]">
        <FiLink aria-hidden className="mt-0.5 size-6 shrink-0 text-[#3d6bd5]" />
        <p className="text-[15px] leading-6">{description}</p>
      </div>
      <div className="mt-5 flex justify-end">
        <button
          className="h-11 rounded-[9px] bg-[#3268ed] px-5 text-sm font-semibold text-white transition hover:bg-[#255be2] disabled:cursor-wait disabled:opacity-65"
          disabled={disabled}
          onClick={onGenerate}
          type="button"
        >
          {generateLabel}
        </button>
      </div>
    </div>
  );
}
