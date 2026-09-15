import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  TRANSACTION_ICON_CATALOG,
} from "@/lib/transaction-visuals/transaction-icon-catalog";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";

test("every transaction icon catalog entry resolves to one public SVG asset", () => {
  assert.ok(TRANSACTION_ICON_CATALOG.length >= 200);
  assert.equal(new Set(TRANSACTION_ICON_CATALOG.map((icon) => icon.key)).size, TRANSACTION_ICON_CATALOG.length);
  assert.equal(new Set(TRANSACTION_ICON_CATALOG.map((icon) => icon.path)).size, TRANSACTION_ICON_CATALOG.length);
  const iconDirectory = join(process.cwd(), "public", "transaction-icons");
  const assetPaths = readdirSync(iconDirectory, { encoding: "utf8", recursive: true })
    .filter((path) => path.endsWith(".svg"))
    .map((path) => "/transaction-icons/" + path.replaceAll("\\", "/"));
  const catalogPaths = new Set<string>(TRANSACTION_ICON_CATALOG.map((icon) => icon.path));
  assert.equal(assetPaths.length, TRANSACTION_ICON_CATALOG.length);

  for (const icon of TRANSACTION_ICON_CATALOG) {
    assert.ok(icon.path.startsWith("/transaction-icons/"));
    assert.ok(
      existsSync(join(process.cwd(), "public", icon.path.slice(1))),
      "Missing icon asset for " + icon.key,
    );
  }

  for (const assetPath of assetPaths) {
    assert.ok(catalogPaths.has(assetPath), "Orphan icon asset at " + assetPath);
  }
});

test("transaction icon matching stays deterministic and conservative", () => {
  assert.equal(resolveTransactionIcon({ merchantName: "Carrefour Market" }).iconKey, "supermarket");
  assert.equal(resolveTransactionIcon({ merchantName: "MTN MoMo" }).iconKey, "mobile-money");
  assert.equal(resolveTransactionIcon({ merchantName: "Orange" }).iconKey, "airtime");
  assert.equal(resolveTransactionIcon({ merchantName: "Netflix" }).iconKey, "streaming");
  assert.equal(resolveTransactionIcon({ categoryName: "Groceries" }).iconKey, "grocery-store");
  assert.equal(resolveTransactionIcon({ transactionKind: "TRANSFER" }).iconKey, "generic-transfer");
  assert.equal(resolveTransactionIcon({ merchantName: "Unclear merchant" }).iconKey, "generic-transaction");
});
