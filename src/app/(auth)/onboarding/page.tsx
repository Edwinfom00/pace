import { redirect } from "next/navigation";

import { getAuthenticatedActor } from "@/authorization/session";
import { loginPathForReturnTo } from "@/modules/auth/post-auth-resolver";

// Temporary M8 routing scaffold. Onboarding UI is intentionally not implemented here.
export default async function OnboardingScaffoldPage() {
  const actor = await getAuthenticatedActor();

  if (!actor) {
    redirect(loginPathForReturnTo("/onboarding"));
  }

  return <main data-temporary-route="onboarding" />;
}
