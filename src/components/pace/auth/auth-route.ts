import type { AuthFormLanguage } from "@/i18n/messages";

type AuthRoutePath = "/login" | "/register";

export function authRouteHref(
  pathname: AuthRoutePath,
  language: AuthFormLanguage,
  returnTo?: string | null,
) {
  const query = new URLSearchParams();

  if (language !== "en") {
    query.set("lang", language);
  }

  if (returnTo) {
    query.set("returnTo", returnTo);
  }

  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
