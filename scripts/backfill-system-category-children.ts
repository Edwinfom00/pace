import { isNull } from "drizzle-orm";

import { ledgerCategories } from "../src/db/schema";
import { backfillSystemCategoryChildren } from "../src/modules/ledger/system-category-children";

function loadEnvironment() {
  process.loadEnvFile(".env");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const url = new URL(databaseUrl.replace(/^['\"]|['\"]$/g, ""));
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const isNamedDevelopmentDatabase =
    /(?:^|[-_])(dev|development|test)(?:[-_]|$)/i.test(
      `${url.hostname} ${url.pathname}`,
    );
  const hasExplicitDevelopmentConfirmation =
    process.env.PACE_CATEGORY_CHILDREN_BACKFILL_CONFIRM === "development" ||
    process.argv.includes("--confirmed-development");
  if (!isLocal && !isNamedDevelopmentDatabase && !hasExplicitDevelopmentConfirmation) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not clearly a development database. Set PACE_CATEGORY_CHILDREN_BACKFILL_CONFIRM=development only after verifying the target.",
    );
  }
}

async function main() {
  loadEnvironment();
  const { db } = await import("../src/db/client");
  const result = await backfillSystemCategoryChildren({
    listSystemCategories: () =>
      db
        .select({
          id: ledgerCategories.id,
          parentCategoryId: ledgerCategories.parentCategoryId,
          name: ledgerCategories.name,
          kind: ledgerCategories.kind,
          isSystem: ledgerCategories.isSystem,
          systemKey: ledgerCategories.systemKey,
        })
        .from(ledgerCategories)
        .where(isNull(ledgerCategories.workspaceId)),
    async insertSystemChildren(children) {
      await db.insert(ledgerCategories).values([...children]);
    },
  });
  const hierarchy = await db
    .select({
      id: ledgerCategories.id,
      parentCategoryId: ledgerCategories.parentCategoryId,
      name: ledgerCategories.name,
      kind: ledgerCategories.kind,
      isSystem: ledgerCategories.isSystem,
      systemKey: ledgerCategories.systemKey,
    })
    .from(ledgerCategories)
    .where(isNull(ledgerCategories.workspaceId));
  const childrenByRoot = new Map<string, number>();
  for (const category of hierarchy) {
    if (category.parentCategoryId)
      childrenByRoot.set(
        category.parentCategoryId,
        (childrenByRoot.get(category.parentCategoryId) ?? 0) + 1,
      );
  }
  console.log(
    JSON.stringify(
      {
        roots: result.roots.map((root) => ({
          id: root.id,
          systemKey: root.systemKey,
          name: root.name,
        })),
        inserted: result.inserted.map((category) => category.systemKey),
        alreadyExisting: result.existing.map((category) => category.systemKey),
        childrenByRoot: Object.fromEntries(childrenByRoot),
      },
      null,
      2,
    ),
  );
}

void main();
