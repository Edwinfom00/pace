import Image from "next/image";
import {
  HiOutlineChartBar,
  HiOutlineShieldCheck,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import { getJoinTranslations, type JoinLanguage } from "@/i18n/join-messages";

type JoinBrandPanelProps = {
  language: JoinLanguage;
  className?: string;
};

const benefits = [
  { icon: HiOutlineUserGroup, id: "collaborate" },
  { icon: HiOutlineShieldCheck, id: "private" },
  { icon: HiOutlineChartBar, id: "more" },
] as const;

export function JoinBrandPanel({ className, language }: JoinBrandPanelProps) {
  const t = getJoinTranslations(language);

  return (
    <section
      aria-labelledby="join-brand-title"
      className={[
        "relative isolate min-h-0 overflow-hidden bg-[#edf3ff] p-[clamp(2.5rem,3vw,3.75rem)] text-[#07152f]",
        className,
      ].filter(Boolean).join(" ")}
    >
      <Image
        alt=""
        className="-z-20 object-cover object-center"
        fill
        preload
        sizes="(max-width: 760px) 0px, (max-width: 1100px) 40vw, 760px"
        src="/auth/pace-login-visual.webp"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-[#f4f7ff]/88 via-[#f4f7ff]/52 to-[#eaf0ff]/5" />

      <header className="relative z-20 flex min-h-[45px] items-center">
        <PaceLogo height={45} preload width={150} />
      </header>

      <div className="relative z-20 mt-[clamp(4rem,7vh,6.5rem)] max-w-[23rem]">
        <h1
          className="m-0 text-[clamp(3rem,4.5vw,4.35rem)] leading-[0.97] font-serif tracking-[-0.055em] text-[#07152f]"
          id="join-brand-title"
        >
          {t("join.left.title")}
        </h1>
        <p className="mt-4 max-w-[24rem] text-[clamp(1rem,1.35vw,1.22rem)] leading-[1.42] text-[#60739b] text-pretty">
          {t("join.left.subtitle")}
        </p>
      </div>

      <ul className="relative z-20 mt-[clamp(2.4rem,5vh,4.5rem)] grid list-none gap-5 p-0">
        {benefits.map(({ icon: Icon, id }) => (
          <li className="flex items-center gap-3.5" key={id}>
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eaf0ff]/92 text-[1.65rem] text-[#215df5] shadow-[0_8px_20px_rgb(87_117_188_/_8%)]">
              <Icon aria-hidden="true" />
            </span>
            <span className="grid gap-0.5">
              <strong className="text-[0.98rem] leading-[1.2] font-semibold text-[#0b1830]">
                {t(`join.left.${id}.title`)}
              </strong>
              <small className="text-[0.86rem] leading-[1.35] text-[#617398]">
                {t(`join.left.${id}.description`)}
              </small>
            </span>
          </li>
        ))}
      </ul>

      <Image
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-10 bottom-[8%] left-1/2 w-[min(34rem,112%)] -translate-x-1/2 object-contain drop-shadow-[0_18px_24px_rgb(50_85_170_/_14%)]"
        height={900}
        src="/join/join-collaboration.png"
        unoptimized
        width={1200}
      />

      <p className="absolute z-20 bottom-[clamp(2rem,4vh,3.5rem)] left-[clamp(2.5rem,3vw,3.75rem)] max-w-[10rem] whitespace-pre-line font-serif text-[clamp(1.4rem,2vw,2rem)] leading-[1.02] italic tracking-[-0.03em] text-white drop-shadow-[0_2px_8px_rgb(12_36_89_/_28%)]">
        {t("join.left.caption")}
      </p>
    </section>
  );
}
