import { HiOutlineLockClosed } from "react-icons/hi2";

type AuthTrustFooterProps = {
  helpLabel: string;
  privacyLabel: string;
  termsLabel: string;
  trustLabel: string;
};

export function AuthTrustFooter({
  helpLabel,
  privacyLabel,
  termsLabel,
  trustLabel,
}: AuthTrustFooterProps) {
  return (
    <footer className="mt-auto flex flex-col items-center gap-5 px-1 pb-7 pt-6 text-center sm:pb-9">
      <p className="flex items-center justify-center gap-2 text-[0.78rem] leading-5 text-[#62708c]">
        <HiOutlineLockClosed aria-hidden="true" className="size-[0.98rem] shrink-0 text-[#33415d]" />
        {trustLabel}
      </p>
      <nav className="flex items-center justify-center gap-6">
        <a
          className="text-[0.78rem] text-[#64718a] transition-colors hover:text-[#17213a] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2360e8]/40"
          href="/terms"
        >
          {termsLabel}
        </a>
        <a
          className="text-[0.78rem] text-[#64718a] transition-colors hover:text-[#17213a] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2360e8]/40"
          href="/privacy"
        >
          {privacyLabel}
        </a>
        <a
          className="text-[0.78rem] text-[#64718a] transition-colors hover:text-[#17213a] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2360e8]/40"
          href="/help"
        >
          {helpLabel}
        </a>
      </nav>
    </footer>
  );
}
