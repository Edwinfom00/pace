export const ONBOARDING_DESTINATION = "/onboarding";
export const ONBOARDING_READY_DESTINATION = "/onboarding/ready";

export function loginPathForReturnTo(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
