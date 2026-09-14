import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";

import { toSupportedLanguage, type SupportedLanguage } from "./messages";

export async function getPersistedUserLanguage(userId: string): Promise<SupportedLanguage> {
  const [user] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return toSupportedLanguage(user?.preferredLanguage);
}

export async function setPersistedUserLanguage(
  userId: string,
  language: SupportedLanguage,
): Promise<SupportedLanguage> {
  const [user] = await db
    .update(users)
    .set({ preferredLanguage: language })
    .where(eq(users.id, userId))
    .returning({ preferredLanguage: users.preferredLanguage });
  return toSupportedLanguage(user?.preferredLanguage);
}
