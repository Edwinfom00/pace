import type { WorkspaceRecord } from "@/modules/workspaces/domain";

import {
  COUNTRY_METADATA,
  getLocalizedCountryName,
  type OnboardingLanguage,
} from "./metadata";
import type {
  OnboardingConnectionMethod,
  PaceProactivity,
  PaceUserProfileRecord,
} from "./profile-domain";

export type OnboardingReadySummary = {
  workspaceName: string;
  countryCurrency: string;
  workspaceType: WorkspaceRecord["type"];
  proactivity: PaceProactivity;
  startingMethod: OnboardingConnectionMethod;
  invitationReady: boolean;
};


export function createOnboardingReadySummary(
  profile: Pick<
    PaceUserProfileRecord,
    "countryCode" | "currency" | "onboardingStartingMethod" | "onboardingInvitationId"
  >,
  workspace: WorkspaceRecord,
  preferences: { proactivity: PaceProactivity },
  language: OnboardingLanguage,
): OnboardingReadySummary {
  const countryCode = profile.countryCode ?? "";
  const flag = COUNTRY_METADATA.find((country) => country.code === countryCode)?.flag;
  const country = getLocalizedCountryName(countryCode, language);
  const countryCurrency = `${flag ? `${flag} ` : ""}${country} · ${profile.currency ?? ""}`;

  return {
    workspaceName: workspace.name,
    countryCurrency,
    workspaceType: workspace.type,
    proactivity: preferences.proactivity,
    startingMethod: profile.onboardingStartingMethod ?? "MANUAL",
    invitationReady: workspace.type !== "PERSONAL" && Boolean(profile.onboardingInvitationId),
  };
}
