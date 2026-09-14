import Image from "next/image";
import {
  HiOutlineArrowsRightLeft,
  HiOutlineCalendarDays,
  HiOutlineChartBarSquare,
  HiOutlineChartPie,
  HiOutlineCog6Tooth,
  HiOutlineFlag,
  HiOutlineHome,
  HiOutlineInbox,
  HiOutlinePaperAirplane,
  HiOutlineSparkles,
  HiOutlineUserGroup,
} from "react-icons/hi2";

import { PaceLogo } from "@/components/pace/brand/pace-logo";
import {
  getAuthBrandTranslations,
  type AuthBrandLanguage,
} from "@/i18n/messages";

type AuthBrandPanelProps = {
  language?: AuthBrandLanguage;
  variant?: "login" | "register";
  className?: string;
};

const primaryBenefits = [
  { id: "clarity", icon: HiOutlineChartBarSquare },
  { id: "goals", icon: HiOutlineFlag },
  { id: "together", icon: HiOutlineUserGroup },
] as const;

const previewNavigation = [
  HiOutlineHome,
  HiOutlineArrowsRightLeft,
  HiOutlineInbox,
  HiOutlineCalendarDays,
  HiOutlineChartPie,
  HiOutlineCog6Tooth,
];

const previewBars = [
  "h-[2.125rem]",
  "h-[3.25rem]",
  "h-[2.75rem]",
  "h-[4.125rem]",
  "h-[4.5rem]",
  "h-[5.7rem]",
  "h-[7.375rem]",
];

export function AuthBrandPanel({
  language = "en",
  variant = "login",
  className,
}: AuthBrandPanelProps) {
  const t = getAuthBrandTranslations(language);
  const showAiBenefit = variant === "register";

  return (
    <section
      aria-label={t("auth.brand.headline")}
      className={[
        "relative isolate min-h-[min(100dvh,1080px)] overflow-hidden bg-[#f3f6ff] p-[clamp(2.5rem,5.1vw,4.9rem)] text-[#07152f] max-xl:p-[3.25rem] max-[940px]:p-10 max-md:min-h-0 max-md:bg-[#f6f8ff] max-md:px-6 max-md:py-7",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-variant={variant}
    >
      <AuthScenicBackground />

      <div className="relative z-30 max-w-[49%] max-[940px]:max-w-[55%] max-md:max-w-none">
        <header className="flex min-h-[45px] items-center">
          <PaceLogo height={45} preload width={150} />
        </header>

        <div className="mt-[clamp(4.5rem,9vw,8.4rem)] max-xl:mt-[6.5rem] max-[940px]:mt-20 max-md:mt-13 max-md:max-w-[30rem]">
          {variant === "register" ? (
            <p className="mb-[1.85rem] mt-0 text-[0.7rem] font-semibold leading-[1.2] tracking-[0.055em] text-[#617096] uppercase">
              {t("auth.brand.eyebrow")}
            </p>
          ) : null}
          <h1 className="m-0 max-w-[7.4ch] text-[clamp(2.8rem,5vw,4.25rem)] leading-[0.98] font-[720] tracking-[-0.038em] text-[#07152f] text-balance max-md:max-w-[11ch] max-md:text-[clamp(2.35rem,10vw,3.5rem)]">
            {t("auth.brand.headline")}
          </h1>
          <p className="mt-[1.15rem] mb-0 max-w-[28rem] text-[clamp(1rem,1.45vw,1.27rem)] leading-[1.45] text-[#5f7094] text-pretty max-md:mt-3.5">
            {t("auth.brand.tagline")}
          </p>
        </div>

        <AuthBenefits showAiBenefit={showAiBenefit} t={t} />
        <AuthTestimonial t={t} />
      </div>

      <AuthProductPreview />

      <div
        aria-hidden="true"
        className="absolute right-[4.6rem] bottom-[3.4rem] left-[4.5rem] z-20 flex items-end justify-between text-[#f8fbff] max-[940px]:right-10 max-[940px]:bottom-10 max-[940px]:left-10 max-md:hidden"
      >
        <p className="m-0 max-w-[10rem] font-serif text-[clamp(1.5rem,2.4vw,2.55rem)] leading-[1.03] tracking-[-0.035em] italic text-balance">
          {t("auth.brand.scenicCaption")}
        </p>
        <div className="flex max-w-36 items-end gap-2.5 font-serif text-base leading-[1.15] text-[#5573a4] italic">
          <span className="h-6 w-9 rounded-bl-full border-b border-l border-current -rotate-[17deg]" />
          <span>{t("auth.brand.agentAnnotation")}</span>
        </div>
      </div>
    </section>
  );
}

function AuthScenicBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-20 bg-[#eaf0ff] max-md:hidden"
    >
      <Image
        alt=""
        className="object-cover object-center"
        fill
        preload
        sizes="(max-width: 760px) 0px, (max-width: 1100px) 48vw, 860px"
        src="/auth/pace-login-visual.webp"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#f4f7ff]/80 via-[#f3f6ff]/40 to-transparent" />
    </div>
  );
}

function AuthBenefits({
  showAiBenefit,
  t,
}: {
  showAiBenefit: boolean;
  t: ReturnType<typeof getAuthBrandTranslations>;
}) {
  const benefits = showAiBenefit
    ? [...primaryBenefits, { id: "ai" as const, icon: HiOutlineSparkles }]
    : primaryBenefits;

  return (
    <ul className="mt-[clamp(2.25rem,4.4vw,4.1rem)] mb-0 grid list-none gap-5 p-0 max-md:hidden">
      {benefits.map(({ icon: Icon, id }) => (
        <li className="flex min-w-0 items-center gap-3.5" key={id}>
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#ebf0ff]/85 text-[1.58rem] text-[#2155f6]"
          >
            <Icon />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-base leading-[1.25] font-[680] text-[#0b1830]">
              {t(`auth.brand.benefits.${id}.title`)}
            </strong>
            <small className="overflow-hidden text-[0.86rem] leading-[1.35] text-ellipsis whitespace-nowrap text-[#617196]">
              {t(`auth.brand.benefits.${id}.description`)}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuthTestimonial({
  t,
}: {
  t: ReturnType<typeof getAuthBrandTranslations>;
}) {
  return (
    <figure className="mt-[clamp(3rem,7.5vw,7.2rem)] mb-0 max-w-[23rem] text-[#5a6a8e] max-[940px]:mt-[3.6rem] max-md:hidden">
      <blockquote className="m-0 text-[clamp(0.94rem,1.25vw,1.08rem)] leading-[1.55] italic text-pretty">
        {t("auth.brand.testimonial.quote")}
      </blockquote>
      <figcaption className="mt-3 text-[0.88rem] text-[#637397]">
        — {t("auth.brand.testimonial.author")}
      </figcaption>
    </figure>
  );
}

function AuthProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="absolute top-[15%] right-[-10%] z-20 grid min-h-[clamp(29rem,44vw,39rem)] w-[63%] max-w-[38rem] grid-cols-[34%_66%] overflow-visible rounded-[1.05rem] bg-white/93 shadow-[0_22px_48px_rgb(42_64_110_/_14%)] rotate-[4deg] origin-[54%_38%] max-xl:right-[-15%] max-xl:w-[65%] max-[940px]:top-[19%] max-[940px]:right-[-18%] max-[940px]:min-h-[28rem] max-[940px]:w-[67%] max-md:hidden"
    >
      <div className="flex flex-col gap-[clamp(2.5rem,5vw,4.2rem)] bg-[#f8faff]/80 p-5 max-[940px]:gap-10">
        <PaceLogo alt="" height={24} variant="icon" width={24} />
        <div className="grid gap-4 max-[940px]:gap-3">
          {previewNavigation.map((Icon, index) => (
            <span
              className="grid size-7 place-items-center rounded-[0.42rem] text-[0.85rem] text-[#52627f] first:bg-[#e8edff] first:text-[#2453f4] max-[940px]:nth-[n+5]:hidden"
              key={`preview-navigation-${index}`}
            >
              <Icon />
            </span>
          ))}
        </div>
      </div>

      <div className="bg-white/66 p-[clamp(1.5rem,3vw,2.8rem)] pt-[clamp(2.35rem,4.1vw,3.7rem)]">
        <div className="grid gap-2.5">
          <span className="block h-[0.88rem] w-[74%] rounded-full bg-[#0a1831]" />
          <i className="block h-[0.47rem] w-[60%] rounded-full bg-[#a8b4cd]" />
        </div>

        <div className="mt-6.5 grid min-h-50 rounded-[0.7rem] bg-[#fafbff]/94 p-5 shadow-[0_8px_18px_rgb(56_76_119_/_8%)]">
          <span className="block h-[0.45rem] w-[55%] rounded-full bg-[#70809f]" />
          <span className="block h-[1.2rem] w-[78%] self-center rounded-full bg-[#0a1831]" />
          <span className="block h-[0.65rem] w-[40%] rounded-full bg-[#a8e7bd]" />
          <div className="mt-4 flex h-[7.35rem] items-end gap-2">
            {previewBars.map((height, index) => (
              <i
                className={`w-[0.82rem] rounded-t-[0.22rem] bg-gradient-to-b from-[#b2c5ff] to-[#7f9dff] ${height}`}
                key={`metric-bar-${index}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-3.5 max-[940px]:hidden">
          {["lime", "amber", "ink"].map((color) => (
            <div className="flex items-center gap-3" key={color}>
              <i
                className="size-7 shrink-0 rounded-full bg-[#a9eabf] data-[color=amber]:bg-[#f9d75a] data-[color=ink]:bg-[#0b1931]"
                data-color={color}
              />
              <span className="grid w-full gap-1.5">
                <b className="block h-2 w-[62%] rounded-full bg-[#0a1831]" />
                <em className="block h-1.5 w-[43%] rounded-full bg-[#aeb9cf]" />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-[-2.4rem] left-[-5.5rem] z-20 flex w-[62%] max-w-[19.5rem] items-center gap-3 rounded-[0.85rem] bg-white/95 px-4 py-3.5 shadow-[0_12px_22px_rgb(34_54_97_/_12%)] -rotate-1 max-xl:left-[-3.25rem]">
        <span className="grid size-8 shrink-0 place-items-center rounded-[0.56rem] bg-[#eef1ff] text-[1.1rem] text-[#365eff]">
          <HiOutlineSparkles />
        </span>
        <span className="grid min-w-0 flex-1 gap-1.5">
          <b className="block h-2 w-[66%] rounded-full bg-[#0a1831]" />
          <em className="block h-1.5 w-[88%] rounded-full bg-[#a5b1ca]" />
        </span>
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#d4dced] text-[0.86rem] text-white">
          <HiOutlinePaperAirplane />
        </span>
      </div>
    </div>
  );
}
