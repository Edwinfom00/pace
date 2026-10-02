import { cache } from "react";

import { getPersistedDashboardLanguage } from "@/i18n/dashboard-server";
import { DatabaseWorkspaceRepository } from "@/modules/workspaces/repositories/workspace-repository";

import { createCategoryLocalizer, type CategoryLocalizer } from "./category-localization";
import { DatabaseLedgerRepository } from "./repositories/ledger-repository";
import { LocalizedLedgerRepository } from "./repositories/localized-ledger-repository";
import { LedgerService } from "./ledger-service";

/** Server-only composition root. Client code never imports the database or repositories. */
export function getLedgerService(): LedgerService {
  return new LedgerService(new DatabaseLedgerRepository(), new DatabaseWorkspaceRepository());
}

export const getCategoryLocalizer = cache(async (userId: string): Promise<CategoryLocalizer> =>
  createCategoryLocalizer(await getPersistedDashboardLanguage(userId)),
);

export async function getLocalizedLedgerRepository(userId: string): Promise<LocalizedLedgerRepository> {
  return new LocalizedLedgerRepository(await getCategoryLocalizer(userId));
}

export async function getLocalizedLedgerService(userId: string): Promise<LedgerService> {
  return new LedgerService(await getLocalizedLedgerRepository(userId), new DatabaseWorkspaceRepository());
}
