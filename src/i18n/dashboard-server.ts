import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";

import { toDashboardLanguage, type DashboardLanguage } from "./dashboard-messages";

export async function getPersistedDashboardLanguage(userId: string): Promise<DashboardLanguage> {
  const [user] = await db
    .select({ preferredLanguage: users.preferredLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return toDashboardLanguage(user?.preferredLanguage);
}
