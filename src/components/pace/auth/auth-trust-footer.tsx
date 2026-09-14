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
    <footer className="mt-auto flex shrink-0 flex-col items-center gap-5 px-1 pb-8 pt-6 text-center sm:pb-12 lg:pb-14 [@media(max-height:850px)]:gap-3 [@media(max-height:850px)]:pb-6 [@media(max-height:850px)]:pt-4">
      <p className="flex items-center justify-center gap-2 text-[0.78rem] leading-5 text-[#62708c]">
        <HiOutlineLockClosed aria-hidden="true" className="size-[0.98rem] shrink-0 text-[#33415d]" />
        {trustLabel}
      </p>
      <div className="flex items-center justify-center gap-6">
        <span className="text-[0.78rem] text-[#64718a]" data-auth-route="/terms">
          {termsLabel}
        </span>
        <span className="text-[0.78rem] text-[#64718a]" data-auth-route="/privacy">
          {privacyLabel}
        </span>
        <span className="text-[0.78rem] text-[#64718a]" data-auth-route="/help">
          {helpLabel}
        </span>
      </div>
    </footer>
  );
}
