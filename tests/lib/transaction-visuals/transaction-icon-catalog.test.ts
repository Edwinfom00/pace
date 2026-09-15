import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  TRANSACTION_ICON_CATALOG,
} from "@/lib/transaction-visuals/transaction-icon-catalog";
import { resolveTransactionIcon } from "@/lib/transaction-visuals/transaction-icon-matcher";
import { MERCHANT_LOGO_CATALOG } from "@/lib/transaction-visuals/merchant-logo-catalog";
import { resolveMerchantLogo } from "@/lib/transaction-visuals/merchant-logo-matcher";

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

test("merchant logo catalog is a bounded set of static merchant identity assets", () => {
  assert.ok(MERCHANT_LOGO_CATALOG.length >= 100);
  assert.equal(new Set(MERCHANT_LOGO_CATALOG.map((logo) => logo.key)).size, MERCHANT_LOGO_CATALOG.length);
  assert.equal(new Set(MERCHANT_LOGO_CATALOG.map((logo) => logo.path)).size, MERCHANT_LOGO_CATALOG.length);
  const logoDirectory = join(process.cwd(), "public", "merchant-logos");
  const assetPaths = readdirSync(logoDirectory, { encoding: "utf8", recursive: true })
    .filter((path) => path.endsWith(".svg"))
    .map((path) => "/merchant-logos/" + path.replaceAll("\\", "/"));
  const catalogPaths = new Set<string>(MERCHANT_LOGO_CATALOG.map((logo) => logo.path));
  assert.equal(assetPaths.length, MERCHANT_LOGO_CATALOG.length);

  for (const logo of MERCHANT_LOGO_CATALOG) {
    assert.ok(logo.path.startsWith("/merchant-logos/"));
    assert.ok(
      existsSync(join(process.cwd(), "public", logo.path.slice(1))),
      "Missing merchant logo for " + logo.key,
    );
  }

  for (const assetPath of assetPaths) {
    assert.ok(catalogPaths.has(assetPath), "Orphan merchant asset at " + assetPath);
  }
});

test("merchant logos are opt-in only for recognised companies", () => {
  assert.equal(resolveMerchantLogo({ merchantName: "NETFLIX.COM" })?.key, "netflix");
  assert.equal(resolveMerchantLogo({ merchantName: "Amazon Prime" })?.key, "amazon");
  assert.equal(resolveMerchantLogo({ merchantName: "Orange Money" })?.key, "orange-money");
  assert.equal(resolveMerchantLogo({ merchantName: "MTN MoMo" })?.key, "mtn-momo");
  assert.equal(resolveMerchantLogo({ merchantName: "Yango Cameroon" })?.key, "yango");
  assert.equal(resolveMerchantLogo({ merchantName: "ENEO Cameroon" })?.key, "eneo");
  assert.equal(resolveMerchantLogo({ merchantName: "A local grocery stall" }), null);
});
