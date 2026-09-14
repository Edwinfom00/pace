type AuthDividerProps = {
  label: string;
};

export function AuthDivider({ label }: AuthDividerProps) {
  return (
    <div className="flex items-center gap-3.5 py-1" role="separator">
      <span aria-hidden="true" className="h-px flex-1 bg-[#e2e7ef]" />
      <span className="shrink-0 text-[0.79rem] leading-none text-[#6d7890]">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-[#e2e7ef]" />
    </div>
  );
}
