import { test } from "node:test";
import assert from "node:assert/strict";
import { livePriceError, liveBuyNowState, minLivePrice } from "../src/utils/liveBuyNow.js";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-20T12:00:00Z");
const lot = (over = {}) => ({
  auctionType: "reserve",
  status: "active",
  winner: null,
  reservePrice: 10000,
  currentPrice: 2000,
  bidCount: 0,
  endDate: new Date(now.getTime() + 48 * HOUR),
  liveBuyNow: { price: 12000, status: null },
  ...over,
});

test("price must be at least 15% above the reserve", () => {
  assert.equal(minLivePrice(10000), 11500);
  assert.equal(minLivePrice(9999), 11499);
  assert.match(livePriceError({ auctionType: "reserve", reservePrice: 10000, price: 11499 }), /15% above/);
  assert.equal(livePriceError({ auctionType: "reserve", reservePrice: 10000, price: 11500 }), null);
});

test("only reserve auctions, and no price means no Buy It Now", () => {
  assert.match(livePriceError({ auctionType: "standard", reservePrice: 0, price: 5000 }), /reserve auctions/);
  assert.equal(livePriceError({ auctionType: "standard", price: "" }), null);
  assert.equal(livePriceError({ auctionType: "reserve", reservePrice: 10000, price: 0 }), null);
});

test("after bids it can be added or lowered but not raised", () => {
  const base = { auctionType: "reserve", reservePrice: 10000, bidCount: 3 };
  assert.equal(livePriceError({ ...base, price: 12000, previous: null }), null);
  assert.match(livePriceError({ ...base, price: 13000, previous: 12000 }), /can't be raised/);
  assert.equal(livePriceError({ ...base, price: 11800, previous: 12000 }), null);
});

test("open while live, with bids below 90% of the reserve and more than 12 hours left", () => {
  assert.equal(liveBuyNowState(lot(), now).available, true);
  assert.equal(liveBuyNowState(lot({ bidCount: 4, currentPrice: 8999 }), now).available, true);
});

test("closes once bidding reaches 90% of the reserve", () => {
  const s = liveBuyNowState(lot({ bidCount: 4, currentPrice: 9000 }), now);
  assert.equal(s.available, false);
  assert.equal(s.reason, "bidding_close_to_reserve");
});

test("closes 12 hours before the end", () => {
  assert.equal(liveBuyNowState(lot({ endDate: new Date(now.getTime() + 12 * HOUR + 1000) }), now).available, true);
  const s = liveBuyNowState(lot({ endDate: new Date(now.getTime() + 12 * HOUR) }), now);
  assert.equal(s.reason, "closing_soon");
});

test("not open before the auction starts, after it's sold, or mid-purchase", () => {
  assert.equal(liveBuyNowState(lot({ status: "draft" }), now).reason, "not_live");
  assert.equal(liveBuyNowState(lot({ status: "sold_buy_now" }), now).reason, "sold");
  assert.equal(liveBuyNowState(lot({ liveBuyNow: { price: 12000, status: "processing" } }), now).reason, "processing");
  assert.equal(liveBuyNowState(lot({ auctionType: "standard" }), now).offered, false);
});
