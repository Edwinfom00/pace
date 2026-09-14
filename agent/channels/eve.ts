import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

import { auth } from "@/lib/auth";

const betterAuthSession: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return null;
  }

  return {
    attributes: {
      email: session.user.email,
      name: session.user.name,
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
