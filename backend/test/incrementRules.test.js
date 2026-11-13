import { test } from "node:test";
import assert from "node:assert/strict";
import { incrementChangeError, minIncrementFor } from "../src/utils/listingRules.js";

test("minimum increment by current bid", () => {
  const cases = [[400, 25], [999, 25], [1000, 50], [4999, 50], [5000, 100], [14999, 100], [15000, 150], [29999, 150], [30000, 250], [59999, 250], [60000, 500], [99999, 500], [100000, 1000], [400000, 1000]];
  for (const [price, min] of cases) assert.equal(minIncrementFor(price), min, `at ${price}`);
});

test("before bids: based on the start price, can raise or lower to the minimum", () => {
  const lot = { bidCount: 0, startPrice: 900, currentPrice: 900, bidIncrement: 100, baseCurrency: "EUR" };
  assert.match(incrementChangeError(lot, 20), /minimum increment at this start price is €25/);
  assert.equal(incrementChangeError(lot, 25), null);
  assert.equal(incrementChangeError(lot, 500), null);
});

test("after bids: based on the current bid, lower only", () => {
  const lot = { bidCount: 3, startPrice: 900, currentPrice: 16000, bidIncrement: 250, baseCurrency: "GBP" };
  assert.match(incrementChangeError(lot, 100), /current bid is £150/);
  assert.equal(incrementChangeError(lot, 150), null);
  assert.match(incrementChangeError(lot, 300), /can't be raised/);
  assert.match(incrementChangeError(lot, 12.5), /whole amount/);
});
