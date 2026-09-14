import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { AuthenticationError } from "./errors";

export interface AuthenticatedActor {
  userId: string;
  email: string;
  name: string;
}

export async function getAuthenticatedActor(): Promise<AuthenticatedActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function requireAuthenticatedActor(): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor();

  if (!actor) {
    throw new AuthenticationError();
  }

  return actor;
}
