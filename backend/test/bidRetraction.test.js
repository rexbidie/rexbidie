// Admin bid retraction before close – what's removed and where the price lands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planBidRetraction } from "../src/utils/bidRetraction.js";

const A = "64b0000000000000000000a1";
const B = "64b0000000000000000000b2";
const C = "64b0000000000000000000c3";
const PROXY_A = "64b0000000000000000000f1";
const PROXY_B = "64b0000000000000000000f2";
const t = (m) => new Date(Date.UTC(2026, 10, 19, 12, m));
const NOW = t(30);

const lot = (over = {}) => ({
  status: "active",
  startPrice: 300,
  currentPrice: 400,
  endDate: t(120),
  bids: [],
  proxyBids: [],
  ...over,
});

test("removes all of the bidder's bids and drops the price to the next bid", () => {
  const plan = planBidRetraction(
    lot({
      bids: [
        { bidder: B, amount: 300, timestamp: t(1) },
        { bidder: A, amount: 350, timestamp: t(2) },
        { bidder: B, amount: 380, timestamp: t(3) },
        { bidder: A, amount: 400, timestamp: t(4) },
      ],
    }),
    A,
    NOW,
  );
  assert.equal(plan.removedBids.length, 2);
  assert.equal(plan.bidCount, 2);
  assert.equal(plan.currentPrice, 380);
  assert.equal(plan.currentBidder, B);
});

test("only bidder retracting resets the lot to its start price with no leader", () => {
  const plan = planBidRetraction(lot({ bids: [{ bidder: A, amount: 400, timestamp: t(1) }] }), A, NOW);
  assert.equal(plan.bidCount, 0);
  assert.equal(plan.currentPrice, 300);
  assert.equal(plan.currentBidder, null);
  assert.equal(plan.lastBidTime, null);
});

test("switches off the retracting bidder's proxy bid", () => {
  const plan = planBidRetraction(
    lot({
      bids: [{ bidder: A, amount: 300, timestamp: t(1), isProxyBid: true, proxyBidId: PROXY_A }],
      proxyBids: [{ _id: PROXY_A, bidder: A, maxAmount: 900, currentBid: 300, isActive: true }],
    }),
    A,
    NOW,
  );
  assert.equal(plan.proxyBids[0].isActive, false);
  assert.equal(plan.retractedProxy.maxAmount, 900);
});

test("drops other proxies' bids that only reacted to the retracted bidder, so they can re-bid lower", () => {
  // C bids 300 manually; A bids 400; B's proxy (max 600) answers 450.
  const plan = planBidRetraction(
    lot({
      currentPrice: 450,
      bids: [
        { bidder: C, amount: 300, timestamp: t(1) },
        { bidder: A, amount: 400, timestamp: t(2) },
        { bidder: B, amount: 450, timestamp: t(3), isProxyBid: true, proxyBidId: PROXY_B },
      ],
      proxyBids: [{ _id: PROXY_B, bidder: B, maxAmount: 600, currentBid: 450, isActive: true }],
    }),
    A,
    NOW,
  );
  assert.deepEqual(plan.keptBids.map((b) => b.amount), [300]);
  assert.equal(plan.droppedProxyBids.length, 1);
  assert.equal(plan.currentPrice, 300);
  assert.equal(plan.currentBidder, C);
  // B's proxy stays on so the cascade re-bids it against C.
  assert.equal(plan.proxyBids[0].isActive, true);
  assert.equal(plan.proxyBids[0].currentBid, 0);
});

test("keeps other bidders' manual bids and proxy bids placed before the retracted bid", () => {
  const plan = planBidRetraction(
    lot({
      currentPrice: 500,
      bids: [
        { bidder: B, amount: 300, timestamp: t(1), isProxyBid: true, proxyBidId: PROXY_B },
        { bidder: A, amount: 400, timestamp: t(2) },
        { bidder: C, amount: 500, timestamp: t(3) },
      ],
      proxyBids: [{ _id: PROXY_B, bidder: B, maxAmount: 450, currentBid: 300, isActive: true }],
    }),
    A,
    NOW,
  );
  assert.deepEqual(plan.keptBids.map((b) => b.amount), [300, 500]);
  assert.equal(plan.currentPrice, 500);
  assert.equal(plan.currentBidder, C);
});

test("keeps bids from a proxy that has since been cancelled (it won't re-bid)", () => {
  const plan = planBidRetraction(
    lot({
      bids: [
        { bidder: A, amount: 350, timestamp: t(1) },
        { bidder: B, amount: 400, timestamp: t(2), isProxyBid: true, proxyBidId: PROXY_B },
      ],
      proxyBids: [{ _id: PROXY_B, bidder: B, maxAmount: 600, currentBid: 400, isActive: false }],
    }),
    A,
    NOW,
  );
  assert.equal(plan.currentPrice, 400);
  assert.equal(plan.currentBidder, B);
});

test("refuses once the lot is closed, not live, or the bidder has no bids", () => {
  const bids = [{ bidder: A, amount: 400, timestamp: t(1) }];
  assert.throws(() => planBidRetraction(lot({ bids, endDate: t(10) }), A, NOW), /already closed/);
  assert.throws(() => planBidRetraction(lot({ bids, status: "sold" }), A, NOW), /while the auction is live/);
  assert.throws(() => planBidRetraction(lot({ bids }), B, NOW), /no bids/);
  assert.throws(
    () => planBidRetraction(lot({ bids, liveBuyNow: { status: "processing" } }), A, NOW),
    /Buy It Now/,
  );
});
