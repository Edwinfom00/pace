import { ForbiddenError, type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { getPersistedUserLanguage } from "@/i18n/server";
import { auth } from "@/lib/auth";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

const betterAuthSession: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return null;
  }

  const requestedWorkspaceId = request.headers.get("x-pace-workspace-id");
  const workspaces = new DatabaseWorkspaceRepository();
  const context = requestedWorkspaceId
    ? await workspaces.findMemberContext(requestedWorkspaceId, session.user.id)
    : await workspaces.findDefaultMemberContext(session.user.id);

  if (!context) {
    throw new ForbiddenError({
      code: "workspace_required",
      message: "A workspace membership is required.",
    });
  }

  const preferredLanguage = await getPersistedUserLanguage(session.user.id);

  return {
    attributes: {
      email: session.user.email,
      name: session.user.name,
      preferredLanguage,
      workspaceCurrency: context.preferences.currency,
      workspaceId: context.workspace.id,
      workspaceLocale: context.preferences.locale,
      workspaceTimezone: context.preferences.timezone,
    },
    authenticator: "better-auth",
    principalId: session.user.id,
    principalType: "user",
  };
};

// This changes only the HTTP access door. The Pace model, instructions, and
// tool behavior remain untouched until workspace-scoped agent work is planned.
export default eveChannel({
  auth: [betterAuthSession, vercelOidc(), localDev()],
});
