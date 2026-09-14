import Link from "next/link";
import { HiOutlineExclamationCircle } from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import {
  getJoinTranslations,
  joinStatusKey,
  type JoinLanguage,
} from "@/i18n/join-messages";
import type { JoinInvitationPreview } from "@/modules/workspaces/domain";

type InviteStatusProps = {
  language: JoinLanguage;
  onDismiss?: () => void;
  preview: JoinInvitationPreview;
};

export function InviteStatus({ language, onDismiss, preview }: InviteStatusProps) {
  const t = getJoinTranslations(language);
  const workspace = preview.workspace;
  const canOpenWorkspace = preview.status === "ALREADY_MEMBER" && Boolean(workspace);

  return (
    <section aria-live="polite" className="grid gap-5 rounded-xl border border-[#dbe4f1] bg-[#fbfcff] p-6 text-center sm:p-8">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#edf3ff] text-2xl text-[#1760f5]">
        <HiOutlineExclamationCircle aria-hidden="true" />
      </span>
      <div className="grid gap-2">
        <h1 className="m-0 text-[clamp(1.75rem,3.5vw,2.25rem)] leading-[1.1] font-bold tracking-[-0.04em] text-[#101a2b]">
          {t(joinStatusKey(preview.status))}
        </h1>
        <p className="m-0 text-[0.95rem] leading-6 text-[#687898]">
          {canOpenWorkspace && workspace ? workspace.name : t("join.help.description")}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {canOpenWorkspace && workspace ? (
          <Button asChild className="h-11 rounded-[0.65rem] bg-[#101a2b] px-5 text-white hover:bg-[#1c2940]">
            <Link href={`/w/${workspace.slug}/overview`}>{t("join.alreadyMember.open")}</Link>
          </Button>
        ) : null}
        {onDismiss ? (
          <Button className="h-11 rounded-[0.65rem] border-[#d5deeb] px-5 text-[#42516d]" onClick={onDismiss} type="button" variant="outline">
            {t("join.preview.cancel")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
