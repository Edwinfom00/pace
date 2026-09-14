import assert from "node:assert/strict";
import test from "node:test";

import {
  CurrencyMismatchError,
  add,
  money,
  sum,
  toDecimalString,
} from "@/money";

test("money uses exact bigint arithmetic without floating-point loss", () => {
  const total = add(money("USD", 9_223_372_036_854_775n), money("USD", 25n));
  assert.equal(total.minor, 9_223_372_036_854_800n);
  assert.equal(toDecimalString(total), "92233720368548.00");
});

test("currency exponents correctly represent zero-, two-, and three-decimal currencies", () => {
  assert.equal(toDecimalString(money("XAF", 1234n)), "1234");
  assert.equal(toDecimalString(money("USD", 12345n)), "123.45");
  assert.equal(toDecimalString(money("BHD", 12345n)), "12.345");
});

test("mixed currencies fail closed unless a conversion strategy is explicitly supplied", () => {
  assert.throws(
    () => sum([money("USD", 100n), money("XAF", 60_000n)]),
    CurrencyMismatchError,
  );

  const converted = sum([money("USD", 100n), money("XAF", 60_000n)], {
    currency: "USD",
    conversion: {
      convert(value, targetCurrency) {
        assert.equal(targetCurrency, "USD");
        return money("USD", value.currency === "XAF" ? 100n : value.minor);
      },
    },
  });
  assert.equal(converted.minor, 200n);
});
