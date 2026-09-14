import { headers } from "next/headers";

import { auth } from "@/lib/auth";

import { AuthenticationError } from "./errors";

export interface AuthenticatedActor {
  userId: string;
  email: string;
  name: string;
}

export async function requireAuthenticatedActor(): Promise<AuthenticatedActor> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    throw new AuthenticationError();
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
