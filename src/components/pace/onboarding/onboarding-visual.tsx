import Image from "next/image";

import type { OnboardingStep } from "@/modules/onboarding/profile-domain";

export const ONBOARDING_VISUAL_ASSETS: Record<OnboardingStep, string> = {
  1: "/onboarding/01-your-pace.png",
  2: "/onboarding/02-workspace.png",
  3: "/onboarding/03-together.png",
  4: "/onboarding/04-connect.png",
  5: "/onboarding/05-preferences.png",
};

type OnboardingVisualProps = {
  step: OnboardingStep;
};

/** The asset registry is the contract future steps use without shell changes. */
export function OnboardingVisual({ step }: OnboardingVisualProps) {
  return (
    <div className="relative mx-auto mt-5 aspect-[1.18] w-[min(100%,32vh)] max-w-[390px]">
      <Image
        alt=""
        className="object-contain"
        fill
        priority={step === 1}
        sizes="(max-width: 1024px) 0px, 390px"
        src={ONBOARDING_VISUAL_ASSETS[step]}
      />
    </div>
  );
}
